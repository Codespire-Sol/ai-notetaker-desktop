// useRecorder.js — thin React wrapper around createRecorder() for the UI.
//
// Usage in a component:
//   const { state, start, stop, level, systemAudio } = useRecorder()
//   ...
//   <button onClick={start} disabled={state === 'recording'}>Record</button>
//   <button onClick={async () => {
//     const result = await stop()          // { blob, mimeType, durationMs, systemAudio }
//     const buf = await result.blob.arrayBuffer()
//     await window.api.saveRecording(buf, result.mimeType) // -> IPC 'recorder:save'
//   }}>Stop</button>

import { useCallback, useEffect, useRef, useState } from 'react'
import { createRecorder } from '../recorder.js'

/**
 * React hook wrapping the audio recorder.
 * @returns {{
 *   state: 'idle' | 'recording',
 *   start: () => Promise<void>,
 *   stop: () => Promise<{ blob: Blob, mimeType: string, durationMs: number, systemAudio: boolean }>,
 *   level: number,          // 0..1 live input level
 *   systemAudio: boolean    // whether system/loopback audio was captured
 * }}
 */
export function useRecorder() {
  const recorderRef = useRef(null)
  const [state, setState] = useState('idle')
  const [level, setLevel] = useState(0)
  const [systemAudio, setSystemAudio] = useState(false)

  // Lazily create a single recorder instance for the component's lifetime.
  if (recorderRef.current === null) {
    recorderRef.current = createRecorder()
    recorderRef.current.onLevel((l) => setLevel(l))
  }

  const start = useCallback(async () => {
    const rec = recorderRef.current
    await rec.start()
    setSystemAudio(rec.isSystemAudio())
    setState(rec.getState())
  }, [])

  const stop = useCallback(async () => {
    const rec = recorderRef.current
    const result = await rec.stop()
    setSystemAudio(result.systemAudio)
    setLevel(0)
    setState(rec.getState())
    return result
  }, [])

  // Safety net: if the component unmounts mid-recording, stop and release devices.
  useEffect(() => {
    return () => {
      const rec = recorderRef.current
      if (rec && rec.getState() === 'recording') {
        rec.stop().catch(() => {})
      }
    }
  }, [])

  return { state, start, stop, level, systemAudio }
}

export default useRecorder
