// macOS system-audio capture.
//
// Windows can capture system audio straight from the renderer (WASAPI loopback via
// getDisplayMedia). macOS blocks that, so we ship a small Swift helper that uses
// Apple's ScreenCaptureKit to capture system audio to a WAV file. The renderer still
// records the microphone; the two are mixed with ffmpeg when the recording stops.
//
// The helper needs no admin password and no driver — only the Screen Recording
// permission the user grants once in System Settings.
import { spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import os from 'os'
import fs from 'fs'

let proc = null          // running helper process
let outPath = ''         // where it's writing the system-audio WAV

/** Locate the compiled Swift helper (packaged app resources, else the dev build dir). */
function helperPath() {
  const packaged = join(process.resourcesPath || '', 'SystemAudioCapture')
  if (fs.existsSync(packaged)) return packaged
  return join(app.getAppPath(), 'mac', 'build', 'SystemAudioCapture')
}

export function isMac() {
  return process.platform === 'darwin'
}

/**
 * Start capturing system audio. Resolves once the helper reports READY (or fails).
 * @returns {Promise<{ok:boolean, path?:string, reason?:string}>}
 */
export function startSystemAudio() {
  return new Promise((resolve) => {
    if (!isMac()) return resolve({ ok: false, reason: 'not-macos' })

    const bin = helperPath()
    if (!fs.existsSync(bin)) return resolve({ ok: false, reason: 'helper-missing' })

    outPath = join(os.tmpdir(), `codespire-sysaudio-${Date.now()}.wav`)

    try {
      proc = spawn(bin, [outPath])
    } catch (e) {
      proc = null
      return resolve({ ok: false, reason: e.message })
    }

    let settled = false
    const done = (res) => { if (!settled) { settled = true; resolve(res) } }

    proc.stdout?.on('data', (d) => {
      if (String(d).includes('READY')) done({ ok: true, path: outPath })
    })
    proc.stderr?.on('data', (d) => {
      // Most common cause: Screen Recording permission not granted yet.
      done({ ok: false, reason: String(d).trim().slice(0, 200) })
    })
    proc.on('error', (e) => { proc = null; done({ ok: false, reason: e.message }) })
    proc.on('exit', () => { if (!settled) done({ ok: false, reason: 'helper exited early' }) })

    // Don't hang the recording if the helper never reports in.
    setTimeout(() => done({ ok: false, reason: 'helper timed out' }), 6000)
  })
}

/**
 * Stop the helper (SIGTERM → it flushes and closes the WAV) and return the file path.
 * @returns {Promise<string>} path to the system-audio WAV, or '' if nothing was captured
 */
export function stopSystemAudio() {
  return new Promise((resolve) => {
    if (!proc) return resolve(outPath && fs.existsSync(outPath) ? outPath : '')

    const p = proc
    const path = outPath
    proc = null

    const finish = () => resolve(path && fs.existsSync(path) ? path : '')

    p.once('exit', finish)
    try { p.kill('SIGTERM') } catch { finish() }

    // Safety: if it doesn't exit, force-kill and continue.
    setTimeout(() => { try { p.kill('SIGKILL') } catch {} ; finish() }, 4000)
  })
}
