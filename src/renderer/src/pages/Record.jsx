import { useState, useEffect } from 'react'
import { Mic, Square, Loader2, AlertTriangle, Radio } from 'lucide-react'
import { useRecorder } from '../hooks/useRecorder.js'

const fmt = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function Record({ onDone, onCancel, autoStart = false }) {
  const { state, start, stop, level, systemAudio } = useRecorder()
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState('setup')   // setup | recording | processing | error
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [matched, setMatched] = useState(null)   // calendar meeting happening now
  const [autoStopReq, setAutoStopReq] = useState(false)

  const MAX_MS = 3 * 60 * 60 * 1000   // 3-hour safety cap

  useEffect(() => {
    if (state !== 'recording') return
    const t0 = Date.now()
    const iv = setInterval(() => {
      const el = Date.now() - t0
      setElapsed(el)
      if (el > MAX_MS) setAutoStopReq(true)   // safety cap → stop
    }, 500)
    return () => clearInterval(iv)
  }, [state])

  // The call ended (mic released) → request auto-stop
  useEffect(() => {
    const off = window.api.onCallEnded(() => setAutoStopReq(true))
    return () => off && off()
  }, [])

  // Process the auto-stop with fresh closures (title/attendees are current here)
  useEffect(() => {
    if (autoStopReq && phase === 'recording') { setAutoStopReq(false); finish() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStopReq, phase])

  // Pre-fill the title from the calendar meeting happening right now
  useEffect(() => {
    window.api.currentMeeting().then((m) => {
      if (m) {
        setMatched(m)
        setTitle((prev) => prev || m.title || '')
        if (m.langPref) setLanguage((prev) => prev || m.langPref)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-start when launched from meeting detection
  useEffect(() => {
    if (autoStart) begin()
    return () => window.api.setRecordingState(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const begin = async () => {
    setError('')
    try {
      await start(); setPhase('recording')
      window.api.setRecordingState(true)   // tell the detector we're recording (avoid self-trigger)
    }
    catch (e) { window.api.setRecordingState(false); setError(e.message || 'Could not start recording. Check microphone permission.'); setPhase('error') }
  }

  const finish = async () => {
    try {
      window.api.setRecordingState(false)
      setPhase('processing'); setStatus('Saving audio…')
      const { blob, mimeType, durationMs } = await stop()
      const buf = await blob.arrayBuffer()
      const { filePath } = await window.api.saveRecording(buf, mimeType, durationMs)

      setStatus('Transcribing with Sarvam…')
      // meeting:process does transcribe + summarize + store in one call
      const meeting = await window.api.processMeeting({
        audioPath: filePath, title: title || 'Untitled meeting',
        language, durationSec: Math.round(durationMs / 1000)
      })
      onDone(meeting.id)
    } catch (e) {
      setError(e.message || 'Processing failed'); setPhase('error')
    }
  }

  return (
    <div className="content">
      <h1 className="page-title">New Recording</h1>
      <p className="page-sub">Records your system audio + microphone locally. Nothing joins the call.</p>

      {phase === 'setup' && (
        <div className="card">
          <div className="field">
            <label>Meeting title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Client sync — Acme" />
            {matched && (
              <p className="hint" style={{ marginTop: 6, color: 'var(--brand)' }}>
                Linked to calendar: “{matched.title}” · {matched.attendees?.length || 0} attendee(s) will be auto-filled for notes
              </p>
            )}
          </div>
          <div className="field">
            <label>Language (optional)</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="">Auto-detect</option>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="te">Telugu</option>
              <option value="ta">Tamil</option>
              <option value="mr">Marathi</option>
              <option value="bn">Bengali</option>
              <option value="gu">Gujarati</option>
            </select>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button className="btn" onClick={begin}><Mic size={16} /> Start Recording</button>
            <button className="btn secondary" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}

      {phase === 'recording' && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 22px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--danger)', fontWeight: 600 }}>
            <Radio size={18} className="pulse" /> Recording
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, color: 'var(--text)', margin: '10px 0', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(elapsed)}
          </div>
          {/* live level meter */}
          <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', maxWidth: 320, margin: '0 auto 8px' }}>
            <div style={{ height: '100%', width: `${Math.min(100, level * 140)}%`, background: 'var(--brand)', transition: 'width .1s' }} />
          </div>
          {!systemAudio && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--warning)', fontSize: 13, marginBottom: 14 }}>
              <AlertTriangle size={14} /> Mic only — system audio unavailable
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <button className="btn" style={{ background: 'var(--danger)' }} onClick={finish}>
              <Square size={15} /> Stop &amp; Generate Notes
            </button>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            Stops automatically when the call ends — or click Stop anytime.
          </p>
        </div>
      )}

      {phase === 'processing' && (
        <div className="card" style={{ textAlign: 'center', padding: '46px 22px' }}>
          <Loader2 size={30} className="spin" color="var(--brand)" />
          <div style={{ marginTop: 16, color: 'var(--text)', fontWeight: 600 }}>{status}</div>
          <p className="hint" style={{ marginTop: 6 }}>Transcribing with Sarvam, then summarizing with OpenAI. This can take a moment.</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)', fontWeight: 600 }}>
            <AlertTriangle size={18} /> Something went wrong
          </div>
          <p className="hint" style={{ marginTop: 8 }}>{error}</p>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button className="btn secondary" onClick={() => { setPhase('setup'); setError('') }}>Try again</button>
            <button className="btn secondary" onClick={onCancel}>Back</button>
          </div>
        </div>
      )}
    </div>
  )
}
