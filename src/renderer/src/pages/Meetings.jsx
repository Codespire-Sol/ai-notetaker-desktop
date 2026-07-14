import { useEffect, useState } from 'react'
import { Mic, ArrowRight, FileText, ChevronRight } from 'lucide-react'

export default function Meetings({ onOpen, onRecord, onGoSettings }) {
  const [meetings, setMeetings] = useState(null)

  useEffect(() => { window.api.listMeetings().then(setMeetings) }, [])

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">Meetings</h1>
          <p className="page-sub">Your recorded meetings and AI notes.</p>
        </div>
        <button className="btn" onClick={onRecord}><Mic size={16} /> New Recording</button>
      </div>

      {meetings === null && <p className="page-sub" style={{ marginTop: 24 }}>Loading…</p>}

      {meetings?.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '54px 22px' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, var(--brand), var(--accent, #0EA5E9))',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Mic size={26} color="#fff" />
          </div>
          <h2 style={{ justifyContent: 'center' }}>No meetings yet</h2>
          <p className="hint" style={{ maxWidth: 400, margin: '6px auto 20px' }}>
            Add your OpenAI, Sarvam and SMTP keys in Settings, then start a recording.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn" onClick={onRecord}><Mic size={16} /> Record now</button>
            <button className="btn secondary" onClick={onGoSettings}>Settings <ArrowRight size={15} /></button>
          </div>
        </div>
      )}

      {meetings?.length > 0 && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {meetings.map((m) => (
            <button key={m.id} className="card" style={{ marginTop: 0, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, width: '100%' }} onClick={() => onOpen(m.id)}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={18} color="var(--brand)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>
                  {new Date(m.createdAt).toLocaleString()} · {Math.round((m.durationSec || 0) / 60)} min
                  {m.emailedTo?.length ? ' · emailed' : ''}
                </div>
              </div>
              <ChevronRight size={18} color="var(--muted)" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
