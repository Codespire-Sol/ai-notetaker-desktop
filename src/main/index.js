import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, desktopCapturer, Notification } from 'electron'
import { join } from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { spawn } from 'child_process'
import { ffmpegPath } from './services/ffmpeg-path.js'
import Store from 'electron-store'
import 'dotenv/config'

import { transcribe, summarize } from './services/ai.js'
import { connectTeams, getTeamsStatus, disconnectTeams, getUpcomingMeetings } from './services/teams.js'
import { sendMeetingNotes, verifySmtp } from './services/email.js'
import { listMeetings, getMeeting, addMeeting, updateMeeting, deleteMeeting } from './services/store-meetings.js'
import { logUsage, getUsageStats } from './services/usage.js'
import { startMeetingDetector } from './services/detector.js'
import { isMac, startSystemAudio, stopSystemAudio } from './services/mac-audio.js'
import { initAutoUpdate, installUpdate } from './services/updater.js'

// ── Persistent settings store ─────────────────────────────────────────────
const store = new Store({
  name: 'codespire-notetaker',
  defaults: {
    openaiKey: '', sarvamKey: '', msClientId: '',
    msAccountType: 'personal',   // which MS accounts Teams sign-in accepts: personal | work | both
    smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '' },
    summarizeModel: 'gpt-4o-mini', sttModel: 'saarika:v2.5',
    autoRecord: false,   // auto-start recording when a meeting/call is detected
    autoEmail: false,    // auto-email the notes to attendees once a meeting is processed
    meetingLangs: {},    // per-calendar-meeting language preference { [meetingId]: 'en' | 'hi' | ... }
    pinHash: '', pinEnabled: false
  }
})

let appIsRecording = false   // set by the renderer so the detector doesn't self-trigger

const envDefault = (k, fallback) => (process.env[k] && process.env[k].length ? process.env[k] : fallback)
const msClientId = () => envDefault('MS_CLIENT_ID', store.get('msClientId'))
const msAccountType = () => envDefault('MS_ACCOUNT_TYPE', store.get('msAccountType')) || 'personal'

let mainWindow = null
let tray = null

const hashPin = (pin) => crypto.createHash('sha256').update(String(pin)).digest('hex')

const recordingsDir = () => {
  const dir = join(app.getPath('userData'), 'recordings')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Codespire app icon (bundled via the `files` list in package.json).
const iconPath = () => join(app.getAppPath(), 'build', 'icon.png')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120, height: 740, minWidth: 940, minHeight: 620,
    show: false, autoHideMenuBar: true, backgroundColor: '#f6f8fc',
    title: 'Codespire Notetaker',
    icon: iconPath(),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((d) => { shell.openExternal(d.url); return { action: 'deny' } })

  if (process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))

  mainWindow.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); mainWindow.hide() } })
}

function createTray() {
  let icon
  try { icon = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 }) } catch { icon = nativeImage.createEmpty() }
  if (!icon || icon.isEmpty()) icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('Codespire Notetaker')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Codespire Notetaker', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } }
  ]))
  tray.on('click', () => mainWindow?.show())
}

// ── Settings ──────────────────────────────────────────────────────────────
function publicSettings() {
  return {
    openaiKey: envDefault('OPENAI_API_KEY', store.get('openaiKey')),
    sarvamKey: envDefault('SARVAM_API_KEY', store.get('sarvamKey')),
    msClientId: msClientId(),
    msAccountType: msAccountType(),
    smtp: {
      host: envDefault('SMTP_HOST', store.get('smtp.host')),
      port: Number(envDefault('SMTP_PORT', store.get('smtp.port'))),
      secure: store.get('smtp.secure'),
      user: envDefault('SMTP_USER', store.get('smtp.user')),
      pass: envDefault('SMTP_PASS', store.get('smtp.pass')),
      from: envDefault('EMAIL_FROM', store.get('smtp.from'))
    },
    summarizeModel: store.get('summarizeModel'),
    sttModel: store.get('sttModel'),
    autoRecord: !!store.get('autoRecord'),
    autoEmail: !!store.get('autoEmail')
  }
}

ipcMain.handle('settings:get', () => publicSettings())
ipcMain.handle('settings:save', (_e, data) => {
  if (data.openaiKey !== undefined) store.set('openaiKey', data.openaiKey)
  if (data.sarvamKey !== undefined) store.set('sarvamKey', data.sarvamKey)
  if (data.msClientId !== undefined) store.set('msClientId', data.msClientId)
  if (data.msAccountType !== undefined) store.set('msAccountType', data.msAccountType)
  if (data.smtp) store.set('smtp', { ...store.get('smtp'), ...data.smtp })
  if (data.summarizeModel) store.set('summarizeModel', data.summarizeModel)
  if (data.sttModel) store.set('sttModel', data.sttModel)
  if (data.autoRecord !== undefined) store.set('autoRecord', !!data.autoRecord)
  if (data.autoEmail !== undefined) store.set('autoEmail', !!data.autoEmail)
  return publicSettings()
})

// Renderer reports its recording state so the detector doesn't trigger on our own mic use.
ipcMain.handle('recorder:setRecording', (_e, on) => { appIsRecording = !!on; return { ok: true } })

// ── PIN ─────────────────────────────────────────────────────────────────────
ipcMain.handle('pin:status', () => ({ enabled: !!store.get('pinEnabled'), isSet: !!store.get('pinHash') }))
ipcMain.handle('pin:set', (_e, pin) => {
  if (!pin || String(pin).length < 4) return { ok: false, error: 'PIN must be at least 4 digits' }
  store.set('pinHash', hashPin(pin)); store.set('pinEnabled', true); return { ok: true }
})
ipcMain.handle('pin:verify', (_e, pin) => ({ ok: store.get('pinHash') === hashPin(pin) }))
ipcMain.handle('pin:disable', () => { store.set('pinEnabled', false); store.set('pinHash', ''); return { ok: true } })

// ── AI ──────────────────────────────────────────────────────────────────────
ipcMain.handle('ai:transcribe', (_e, { audioPath, language = '' } = {}) =>
  transcribe({ audioPath, sarvamKey: publicSettings().sarvamKey, model: store.get('sttModel'), language }))
ipcMain.handle('ai:summarize', (_e, { transcript, meetingTitle = 'Meeting', language = 'auto' } = {}) =>
  summarize({ transcript, openaiKey: publicSettings().openaiKey, model: store.get('summarizeModel'), meetingTitle, language }))

// ── macOS system audio (ScreenCaptureKit helper) ────────────────────────────
// Windows gets system audio in the renderer via loopback; macOS can't, so the
// Swift helper captures it here and we mix it with the mic on save.
ipcMain.handle('macaudio:start', () => startSystemAudio())

/** Mix the mic recording with the macOS system-audio WAV into one file. */
function mixWithSystemAudio(micPath, sysPath) {
  return new Promise((resolve) => {
    if (!ffmpegPath || !fs.existsSync(sysPath)) return resolve(micPath)
    const out = micPath.replace(/\.webm$/i, '-mixed.webm')
    const args = [
      '-i', micPath, '-i', sysPath,
      '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=0[a]',
      '-map', '[a]', '-c:a', 'libopus', '-b:a', '96k', '-y', out,
    ]
    const p = spawn(ffmpegPath, args, { windowsHide: true })
    p.on('close', (code) => {
      if (code === 0 && fs.existsSync(out)) {
        try { fs.unlinkSync(micPath); fs.unlinkSync(sysPath) } catch {}
        resolve(out)
      } else resolve(micPath)   // mixing failed — keep the mic-only recording
    })
    p.on('error', () => resolve(micPath))
  })
}

// ── Recorder: persist the recorded audio to disk ────────────────────────────
ipcMain.handle('recorder:save', async (_e, { arrayBuffer, mimeType, durationMs }) => {
  const ext = (mimeType || '').includes('webm') ? 'webm' : 'bin'
  let filePath = join(recordingsDir(), `meeting-${Date.now()}.${ext}`)
  fs.writeFileSync(filePath, Buffer.from(arrayBuffer))

  // On macOS the renderer only captured the mic — stop the ScreenCaptureKit helper
  // and mix its system audio in, so the recording has both sides of the meeting.
  if (isMac()) {
    const sysPath = await stopSystemAudio()
    if (sysPath) filePath = await mixWithSystemAudio(filePath, sysPath)
  }

  return { filePath, durationMs }
})

// ── Full pipeline: audioPath → transcribe → summarize → store meeting ───────
// Microsoft masks attendee addresses on PERSONAL accounts as
// outlook_<hash>@outlook.com. Those aren't deliverable, so never try to email them
// (work/school accounts return the real addresses and pass straight through).
function deliverableEmails(list) {
  return (list || []).filter(
    (e) => e && e.includes('@') && !/^outlook_[0-9a-f]+@outlook\.com$/i.test(e.trim())
  )
}

// Find the calendar meeting happening right now (for auto-labeling a recording).
// getTeamsStatus is async — it MUST be awaited, or `.connected` reads as undefined
// on the pending promise and every recording silently falls back to "Untitled meeting".
async function matchCurrentMeeting() {
  try {
    const status = await getTeamsStatus({ store })
    if (!status.connected || !msClientId()) return null
    // look back 30 min so a meeting that just ended is still a match candidate
    const meetings = await getUpcomingMeetings({ store, clientId: msClientId(), lookbackMinutes: 30 })
    const now = Date.now()
    const grace = 15 * 60 * 1000   // ±15 min so early/late starts still match
    // Prefer the meeting we're actually inside; only then fall back to the grace window.
    const inWindow = (mm, pad) => {
      const s = new Date(mm.start).getTime()
      const e = new Date(mm.end).getTime()
      return (s - pad) <= now && now <= (e + pad)
    }
    const m = meetings.find((mm) => inWindow(mm, 0)) || meetings.find((mm) => inWindow(mm, grace))
    if (!m) return null
    const langs = store.get('meetingLangs') || {}
    return { ...m, langPref: langs[m.id] || '' }
  } catch { return null }
}
ipcMain.handle('calendar:current', () => matchCurrentMeeting())

ipcMain.handle('meeting:process', async (_e, { audioPath, title, language = '', durationSec = 0, attendees = [] }) => {
  // Link the recording to the calendar meeting happening now → title + attendees.
  const matched = await matchCurrentMeeting()
  const hasTitle = title && title.trim() && title.trim().toLowerCase() !== 'untitled meeting'
  // Never persist the "Untitled meeting" placeholder — if the calendar has no match,
  // a date-stamped name is at least identifiable in the meetings list.
  const finalTitle = hasTitle
    ? title.trim()
    : (matched?.title || `Meeting — ${new Date().toLocaleString()}`)
  const finalAttendees = (attendees && attendees.length) ? attendees : (matched?.attendees || [])
  // language priority: what the recorder sent → the meeting's saved language → auto
  const finalLang = (language && language.trim()) ? language : (matched?.langPref || '')

  const t = await transcribe({ audioPath, sarvamKey: publicSettings().sarvamKey, model: store.get('sttModel'), language: finalLang })
  const s = await summarize({
    transcript: t.full_text, openaiKey: publicSettings().openaiKey,
    model: store.get('summarizeModel'), meetingTitle: finalTitle, language: t.language || 'auto'
  })
  const meeting = addMeeting({
    title: finalTitle, durationSec: durationSec || t.duration, language: t.language,
    audioPath, attendees: finalAttendees, summary: s.summary, actionItems: s.action_items,
    keyDecisions: s.key_decisions, followUps: s.follow_up_questions, sentiment: s.sentiment,
    transcript: t.full_text, segments: t.segments
  })
  // Log AI usage + cost for the dashboard
  logUsage({ operation: 'transcribe', provider: 'sarvam', model: store.get('sttModel'),
    meetingId: meeting.id, meetingTitle: meeting.title, audioSeconds: durationSec || t.duration })
  logUsage({ operation: 'summarize', provider: 'openai', model: s.model || store.get('summarizeModel'),
    meetingId: meeting.id, meetingTitle: meeting.title,
    inputTokens: s.usage?.inputTokens || 0, outputTokens: s.usage?.outputTokens || 0 })

  // Auto-email the notes to the meeting's attendees, if enabled.
  if (store.get('autoEmail')) {
    const to = deliverableEmails(finalAttendees)
    const smtp = publicSettings().smtp
    if (to.length && smtp.host && smtp.user) {
      try {
        // same "smart attach" rule as the manual send: audio only if it won't bounce
        let audioPath = ''
        let p = meeting.audioPath
        if (p && /\.webm$/i.test(p)) p = await ensureSeekableMp3(p)
        if (p && fs.existsSync(p) && fs.statSync(p).size / (1024 * 1024) <= MAX_AUDIO_EMAIL_MB) audioPath = p

        await sendMeetingNotes({
          smtp, to, meetingTitle: finalTitle, summary: s.summary,
          actionItems: s.action_items, keyDecisions: s.key_decisions,
          transcriptText: t.full_text, audioPath,
        })
        updateMeeting(meeting.id, { emailedTo: to })
        meeting.emailedTo = to
      } catch {
        // Never fail the recording because the email didn't go out — the user can
        // still send it manually from the meeting page.
      }
    }
  }

  return meeting
})

ipcMain.handle('usage:stats', () => getUsageStats())

// ── Auto-update ─────────────────────────────────────────────────────────────
ipcMain.handle('update:install', () => installUpdate())

// ── Meetings CRUD ───────────────────────────────────────────────────────────
ipcMain.handle('meetings:list', () => listMeetings())
ipcMain.handle('meetings:get', (_e, id) => getMeeting(id))
ipcMain.handle('meetings:update', (_e, { id, patch }) => updateMeeting(id, patch))
ipcMain.handle('meetings:delete', (_e, id) => deleteMeeting(id))
// MediaRecorder .webm files lack duration metadata → the player can't show total
// length or seek. Transcode to MP3 once (cached) so the scrubber works fully.
function ensureSeekableMp3(webmPath) {
  return new Promise((resolve) => {
    const mp3 = webmPath.replace(/\.webm$/i, '.mp3')
    if (fs.existsSync(mp3)) return resolve(mp3)
    if (!ffmpegPath) return resolve(webmPath)
    const p = spawn(ffmpegPath, ['-i', webmPath, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', '-y', mp3], { windowsHide: true })
    p.on('close', (code) => resolve(code === 0 && fs.existsSync(mp3) ? mp3 : webmPath))
    p.on('error', () => resolve(webmPath))
  })
}

ipcMain.handle('meeting:getAudio', async (_e, id) => {
  const m = getMeeting(id)
  if (!m || !m.audioPath || !fs.existsSync(m.audioPath)) return null
  let playPath = m.audioPath
  if (/\.webm$/i.test(playPath)) playPath = await ensureSeekableMp3(playPath)
  const buf = fs.readFileSync(playPath)
  const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return { data, mimeType: /\.mp3$/i.test(playPath) ? 'audio/mpeg' : 'audio/webm' }
})

// ── Teams ─────────────────────────────────────────────────────────────────────
ipcMain.handle('teams:connect', async () => {
  try { return await connectTeams({ clientId: msClientId(), store, accountType: msAccountType() }) }
  catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('teams:status', () => getTeamsStatus({ store }))
ipcMain.handle('teams:disconnect', () => disconnectTeams({ store }))
ipcMain.handle('teams:meetings', async () => {
  try {
    const meetings = await getUpcomingMeetings({ store, clientId: msClientId() })
    const langs = store.get('meetingLangs') || {}
    // attach each meeting's saved language preference (default '' = auto)
    return { ok: true, meetings: meetings.map((m) => ({ ...m, langPref: langs[m.id] || '' })) }
  } catch (e) { return { ok: false, error: e.message } }
})

// Per-meeting language preference (used when that meeting auto-records)
ipcMain.handle('meetingLang:set', (_e, { meetingId, lang }) => {
  if (!meetingId) return { ok: false }
  const langs = store.get('meetingLangs') || {}
  if (lang) langs[meetingId] = lang; else delete langs[meetingId]
  store.set('meetingLangs', langs)
  return { ok: true }
})

// ── Email ─────────────────────────────────────────────────────────────────────
const MAX_AUDIO_EMAIL_MB = 20   // most inboxes cap attachments at ~20–25 MB
ipcMain.handle('email:send', async (_e, payload) => {
  // Smart audio attach: include the recording only if it's small enough not to bounce.
  let audioPath = ''
  let audioSkipped = false
  if (payload.meetingId) {
    const m = getMeeting(payload.meetingId)
    if (m && m.audioPath && fs.existsSync(m.audioPath)) {
      let p = m.audioPath
      if (/\.webm$/i.test(p)) p = await ensureSeekableMp3(p)   // prefer the seekable mp3
      const sizeMB = fs.statSync(p).size / (1024 * 1024)
      if (sizeMB <= MAX_AUDIO_EMAIL_MB) audioPath = p
      else audioSkipped = true
    }
  }
  const result = await sendMeetingNotes({ smtp: publicSettings().smtp, audioPath, ...payload })
  return { ...result, audioAttached: !!audioPath, audioSkipped }
})
ipcMain.handle('email:verify', (_e, smtp) => verifySmtp(smtp || publicSettings().smtp))

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // System-audio capture: grant a screen source + Windows loopback audio.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' })
    }).catch(() => callback({}))
  }, { useSystemPicker: false })

  createWindow()
  createTray()

  // Check for a newer release and download it in the background (Windows).
  initAutoUpdate(() => mainWindow)

  // Meeting detector — detect an active call (a non-self app using the mic) and
  // notify / auto-record. It keeps polling during our recording (our own app is
  // excluded), so it can also detect when the CALL ENDS → auto-stop.
  startMeetingDetector({
    onStart: ({ app: micApp }) => {
      if (appIsRecording) return   // already recording — don't double-trigger
      const autoRecord = !!store.get('autoRecord')
      mainWindow?.webContents?.send('detector:call-started', { app: micApp, autoRecord })
      if (Notification.isSupported()) {
        new Notification({
          title: 'Meeting detected',
          body: autoRecord ? 'Recording started automatically. It will stop when the call ends.' : 'Open Codespire Notetaker to record this meeting.',
        }).show()
      }
      if (autoRecord) mainWindow?.show()
    },
    onStop: () => mainWindow?.webContents?.send('detector:call-ended'),
  })

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { /* stay in tray */ })
