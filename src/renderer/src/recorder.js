// recorder.js — local meeting audio recorder for the Electron renderer (Chromium).
//
// Captures SYSTEM audio (what the user hears = the other participants, via
// getDisplayMedia loopback) MIXED with the user's MICROPHONE, records the mix
// with MediaRecorder, and returns the result as a Blob. No bot/browser joins
// the meeting — this is pure local capture.
//
// Pure browser Web APIs, no external deps.
//
// IMPORTANT (Electron main-process requirement):
// getDisplayMedia() only returns system/loopback audio on Windows if the MAIN
// process installs a display-media request handler. See the integration note
// at the bottom of this file (and the message returned to the integrator) for
// the exact session.setDisplayMediaRequestHandler(...) snippet to add to
// src/main/index.js.

const MIME_TYPE = 'audio/webm;codecs=opus'

/**
 * Create a recorder instance.
 * @returns {{
 *   start: () => Promise<void>,
 *   stop: () => Promise<{ blob: Blob, mimeType: string, durationMs: number, systemAudio: boolean }>,
 *   getState: () => 'idle' | 'recording',
 *   isSystemAudio: () => boolean,
 *   onLevel: (cb: (level: number) => void) => void
 * }}
 */
export function createRecorder() {
  // --- internal state ---
  let state = 'idle' // 'idle' | 'recording'

  let audioContext = null
  let destination = null // MediaStreamDestination (the mixed output)
  let mediaRecorder = null

  let displayStream = null // from getDisplayMedia (system audio + throwaway video)
  let micStream = null // from getUserMedia (microphone)

  let sysSourceNode = null
  let micSourceNode = null
  let analyser = null

  let chunks = []
  let systemAudio = false // did we actually get a system-audio track?
  let startedAt = 0

  // level metering
  let levelCb = null
  let levelRaf = 0
  let levelData = null

  function getState() {
    return state
  }

  /** Whether system/loopback audio is currently part of the mix. */
  function isSystemAudio() {
    return systemAudio
  }

  /**
   * Register a callback that receives a rough input level (0..1) for a live meter.
   * Safe to call before or after start(); metering runs while recording.
   */
  function onLevel(cb) {
    levelCb = typeof cb === 'function' ? cb : null
  }

  function startLevelLoop() {
    if (!analyser || !levelCb) return
    levelData = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      if (state !== 'recording' || !analyser || !levelCb) return
      analyser.getByteTimeDomainData(levelData)
      // RMS around the 128 midpoint -> rough 0..1 amplitude.
      let sumSquares = 0
      for (let i = 0; i < levelData.length; i++) {
        const v = (levelData[i] - 128) / 128
        sumSquares += v * v
      }
      const rms = Math.sqrt(sumSquares / levelData.length)
      // Light scaling so typical speech reads meaningfully on the meter.
      const level = Math.min(1, rms * 2.2)
      try {
        levelCb(level)
      } catch {
        /* swallow callback errors so the loop keeps running */
      }
      levelRaf = requestAnimationFrame(tick)
    }
    levelRaf = requestAnimationFrame(tick)
  }

  function stopLevelLoop() {
    if (levelRaf) cancelAnimationFrame(levelRaf)
    levelRaf = 0
    levelData = null
  }

  async function start() {
    if (state === 'recording') return

    chunks = []
    systemAudio = false

    // 1) Try to capture SYSTEM audio via getDisplayMedia. In Electron on Windows
    //    (with the main-process handler returning audio: 'loopback') this yields
    //    the system/loopback audio. We must request video too (loopback audio is
    //    only offered alongside a screen video track), then immediately drop it.
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true
      })

      // Immediately stop + remove the video track — we only want the audio.
      for (const vt of displayStream.getVideoTracks()) {
        vt.stop()
        displayStream.removeTrack(vt)
      }

      if (displayStream.getAudioTracks().length > 0) {
        systemAudio = true
      } else {
        // Got a stream but no audio track (loopback unavailable) — discard it.
        stopStream(displayStream)
        displayStream = null
      }
    } catch (err) {
      // User cancelled the picker, or loopback is unsupported — fall back to mic only.
      // eslint-disable-next-line no-console
      console.warn('[recorder] getDisplayMedia failed, falling back to mic only:', err)
      displayStream = null
      systemAudio = false
    }

    // 2) Capture the MICROPHONE. This is required — if it fails we clean up and throw.
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      // No mic — clean up any system stream we opened and abort.
      if (displayStream) {
        stopStream(displayStream)
        displayStream = null
      }
      state = 'idle'
      throw new Error(
        '[recorder] Microphone capture failed (getUserMedia): ' + (err && err.message ? err.message : err)
      )
    }

    // 3) Mix system + mic into a single stream with the Web Audio API.
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    // AudioContext may start 'suspended' (autoplay policy) — resume it.
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume()
      } catch {
        /* best effort */
      }
    }

    destination = audioContext.createMediaStreamDestination()

    if (displayStream && displayStream.getAudioTracks().length > 0) {
      sysSourceNode = audioContext.createMediaStreamSource(displayStream)
      sysSourceNode.connect(destination)
    }

    micSourceNode = audioContext.createMediaStreamSource(micStream)
    micSourceNode.connect(destination)

    // Analyser tap for the live level meter (fed by the mixed destination).
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 512
    // Route the mixed sources through the analyser as well (analyser doesn't need
    // to connect onward — reading its buffer is enough, and we must NOT connect it
    // to audioContext.destination or the meeting audio would echo to the speakers).
    if (sysSourceNode) sysSourceNode.connect(analyser)
    micSourceNode.connect(analyser)

    // 4) Record the mixed stream.
    const options = MediaRecorder.isTypeSupported(MIME_TYPE) ? { mimeType: MIME_TYPE } : undefined
    mediaRecorder = new MediaRecorder(destination.stream, options)

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }

    mediaRecorder.start(1000) // gather data in ~1s timeslices
    startedAt = Date.now()
    state = 'recording'

    startLevelLoop()
  }

  async function stop() {
    if (state !== 'recording') {
      // Nothing recording — return an empty, well-formed result.
      return {
        blob: new Blob([], { type: MIME_TYPE }),
        mimeType: MIME_TYPE,
        durationMs: 0,
        systemAudio
      }
    }

    const durationMs = Date.now() - startedAt
    const capturedSystemAudio = systemAudio

    stopLevelLoop()

    // Wait for the recorder to flush its final chunk, then assemble the Blob.
    const blob = await new Promise((resolve) => {
      const finalize = () => {
        const outType = (mediaRecorder && mediaRecorder.mimeType) || MIME_TYPE
        resolve(new Blob(chunks, { type: outType }))
      }

      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = finalize
        try {
          mediaRecorder.stop()
        } catch {
          finalize()
        }
      } else {
        finalize()
      }
    })

    // Tear down everything.
    stopStream(displayStream)
    stopStream(micStream)

    try {
      if (sysSourceNode) sysSourceNode.disconnect()
      if (micSourceNode) micSourceNode.disconnect()
      if (analyser) analyser.disconnect()
    } catch {
      /* ignore */
    }

    if (audioContext && audioContext.state !== 'closed') {
      try {
        await audioContext.close()
      } catch {
        /* ignore */
      }
    }

    // Reset state.
    displayStream = null
    micStream = null
    sysSourceNode = null
    micSourceNode = null
    analyser = null
    destination = null
    audioContext = null
    mediaRecorder = null
    chunks = []
    state = 'idle'

    return {
      blob,
      mimeType: (blob && blob.type) || MIME_TYPE,
      durationMs,
      systemAudio: capturedSystemAudio
    }
  }

  return { start, stop, getState, isSystemAudio, onLevel }
}

function stopStream(stream) {
  if (!stream) return
  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      /* ignore */
    }
  }
}

export default createRecorder
