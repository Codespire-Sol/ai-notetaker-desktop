// macOS meeting detector — per-app microphone usage via the MicProbe helper.
//
// MicProbe (Core Audio) prints the bundle id of every process using the mic:
//   macOS 14+ : one line per app, e.g. "com.microsoft.teams2"  → per-app, so we
//               can exclude our OWN recording and still see the call end.
//   macOS <14 : the literal "system-input" (global fallback) → good enough to
//               auto-START, but our own recording keeps the mic busy, so
//               auto-STOP is not reliable there.
//
// We exclude our own app the same way the Windows detector does (IGNORE regex),
// so what remains is "some OTHER app is using the mic" == a meeting is live.
import { spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import fs from 'fs'

// Our own processes (main + Electron helpers) must never count as "a call".
const IGNORE = /codespire|notetaker|electron/i

// Prettify a bundle id for the "Meeting detected (…)" notification.
const FRIENDLY = [
  [/teams/i, 'Teams'],
  [/zoom/i, 'Zoom'],
  [/webex/i, 'Webex'],
  [/slack/i, 'Slack'],
  [/skype/i, 'Skype'],
  [/google.*meet|meet\.google/i, 'Google Meet'],
  [/chrome/i, 'Chrome'],
  [/msedge|edge/i, 'Edge'],
  [/firefox/i, 'Firefox'],
  [/safari/i, 'Safari'],
]
function friendlyName(bundle) {
  if (!bundle || bundle === 'system-input' || bundle === 'unknown') return ''
  for (const [re, name] of FRIENDLY) if (re.test(bundle)) return name
  // Fall back to the last dotted segment: com.microsoft.teams2 -> teams2
  return bundle.split('.').pop() || ''
}

/** Locate the compiled MicProbe helper (packaged app resources, else dev build dir). */
function probePath() {
  const packaged = join(process.resourcesPath || '', 'MicProbe')
  if (fs.existsSync(packaged)) return packaged
  return join(app.getAppPath(), 'mac', 'build', 'MicProbe')
}

/** Run MicProbe once. Resolves to the raw bundle-id lines it printed. */
function runProbe() {
  return new Promise((resolve) => {
    const bin = probePath()
    if (!fs.existsSync(bin)) return resolve([])

    let out = ''
    let proc
    try {
      proc = spawn(bin, [])
    } catch {
      return resolve([])
    }

    proc.stdout?.on('data', (d) => { out += d.toString() })
    proc.on('error', () => resolve([]))
    proc.on('close', () => {
      resolve(out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    })

    // The probe is a one-shot; don't let a stuck process wedge the poll loop.
    setTimeout(() => { try { proc.kill() } catch { /* gone */ } ; resolve([]) }, 4000)
  })
}

/**
 * Is a meeting active right now (some app OTHER than us using the mic)?
 * @returns {Promise<{active:boolean, app:string|null}>}
 */
export async function isCallActiveMac() {
  const lines = await runProbe()
  const others = lines.filter((b) => !IGNORE.test(b))
  if (!others.length) return { active: false, app: null }
  // Prefer a recognizable conferencing app for the label; any other counts.
  const labelled = others.map(friendlyName).find(Boolean)
  return { active: true, app: labelled || null }
}
