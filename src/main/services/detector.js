// Meeting detector — detects when a call is active by checking which app is
// CURRENTLY using the microphone, then auto-starts / auto-stops recording.
//
//   Windows : per-app mic usage under CapabilityAccessManager; while an app is
//             actively using the mic its `LastUsedTimeStop` value is 0.
//   macOS   : per-app mic usage via the MicProbe Core Audio helper (see
//             detector-mac.js); global-boolean fallback on macOS < 14.
//   other   : no-op (never reports a call).
//
// Both real platforms report PER-APP usage and exclude our own recorder, so the
// detector keeps polling during our recording and still sees the CALL END →
// auto-stop, without a webhook or seeing "inside" Teams.
import { spawn } from 'child_process'
import { isCallActiveMac } from './detector-mac.js'

const MIC_KEYS = [
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone',
]

// App keys we ignore (our own recorder uses the mic too — avoid a feedback loop).
const IGNORE = /electron|codespire|ai-notetaker/i
// Conferencing apps we care about (best-effort; empty match still counts as a call).
const CONFERENCING = /teams|zoom|webex|msedge|chrome|firefox|slack|meet|skype/i

function regQuery(key) {
  return new Promise((resolve) => {
    const p = spawn('reg', ['query', key, '/s'], { windowsHide: true })
    let out = ''
    p.stdout.on('data', (d) => { out += d.toString() })
    p.on('close', () => resolve(out))
    p.on('error', () => resolve(''))
  })
}

function parseActiveApps(out) {
  const lines = out.split(/\r?\n/)
  let key = ''
  const apps = []
  for (const line of lines) {
    const t = line.trim()
    if (/^HKEY_/i.test(t)) key = t
    else if (/LastUsedTimeStop/i.test(t) && /\b0x0\b/.test(t)) {
      const app = (key.split('\\').pop() || '').replace(/#/g, '\\')
      if (app && !IGNORE.test(app)) apps.push(app)
    }
  }
  return apps
}

async function isCallActiveWin() {
  for (const key of MIC_KEYS) {
    const apps = parseActiveApps(await regQuery(key))
    if (apps.length) {
      // Prefer a recognizable conferencing app, but any active mic app counts.
      const conf = apps.find((a) => CONFERENCING.test(a))
      return { active: true, app: conf || apps[0] }
    }
  }
  return { active: false, app: null }
}

// Dispatch to the right per-platform check. Same {active, app} shape everywhere.
async function isCallActive() {
  if (process.platform === 'win32') return isCallActiveWin()
  if (process.platform === 'darwin') return isCallActiveMac()
  return { active: false, app: null }
}

/**
 * Start polling for meeting activity.
 * @param {object} o
 * @param {() => boolean} o.isSuppressed  return true to ignore detection (e.g. while we're recording)
 * @param {(info:{app:string}) => void} o.onStart  fired once when a call becomes active
 * @param {() => void} o.onStop  fired once when the call ends
 * @param {number} [o.intervalMs=20000]
 * @returns {() => void} stop function
 */
export function startMeetingDetector({ isSuppressed = () => false, onStart, onStop, intervalMs = 20000 }) {
  let active = false
  let stopped = false

  const tick = async () => {
    if (stopped) return
    if (isSuppressed()) return
    try {
      const { active: nowActive, app } = await isCallActive()
      if (nowActive && !active) { active = true; onStart?.({ app }) }
      else if (!nowActive && active) { active = false; onStop?.() }
    } catch { /* ignore poll errors */ }
  }

  const iv = setInterval(tick, intervalMs)
  tick()
  return () => { stopped = true; clearInterval(iv) }
}
