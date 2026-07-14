import { useEffect, useState } from 'react'
import { ArrowLeft, Mail, FileText, CheckSquare, Flag, HelpCircle, Loader2, Trash2, Volume2, Pencil, Check, X } from 'lucide-react'

export default function MeetingDetail({ id, onBack }) {
  const [m, setM] = useState(null)
  const [recipients, setRecipients] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState('')
  const [showTranscript, setShowTranscript] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  useEffect(() => {
    window.api.getMeeting(id).then((data) => {
      setM(data)
      if (data?.attendees?.length) setRecipients(data.attendees.join(', '))
    })
  }, [id])

  useEffect(() => {
    let url = null
    window.api.getMeetingAudio(id).then((res) => {
      if (res?.data) {
        url = URL.createObjectURL(new Blob([res.data], { type: res.mimeType }))
        setAudioUrl(url)
      }
    })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [id])

  const flash = (t) => { setToast(t); setTimeout(() => setToast(''), 2600) }

  if (!m) return <div className="content"><p className="page-sub">Loading…</p></div>

  const emailNotes = async () => {
    const to = recipients.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean)
    if (!to.length) return flash('Add at least one recipient email')
    setSending(true)
    try {
      const res = await window.api.sendMeetingNotes({
        meetingId: m.id, to, meetingTitle: m.title, summary: m.summary,
        actionItems: m.actionItems, keyDecisions: m.keyDecisions, transcriptText: m.transcript
      })
      await window.api.updateMeeting(m.id, { emailedTo: to })
      const n = res.accepted?.length || to.length
      const audioNote = res.audioAttached ? ' + audio' : (res.audioSkipped ? ' (audio too large — skipped)' : '')
      flash(`Notes${audioNote} emailed to ${n} recipient(s)`)
    } catch (e) {
      flash(e.message || 'Email failed — check SMTP settings')
    }
    setSending(false)
  }

  const del = async () => {
    await window.api.deleteMeeting(m.id)
    onBack()
  }

  const saveTitle = async () => {
    const t = titleDraft.trim()
    if (!t) return
    await window.api.updateMeeting(m.id, { title: t })
    setM({ ...m, title: t }); setEditing(false); flash('Title updated')
  }

  const date = new Date(m.createdAt).toLocaleString()
  const mins = Math.round((m.durationSec || 0) / 60)

  return (
    <div className="content">
      <button className="btn ghost" style={{ padding: '4px 0', marginBottom: 8 }} onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditing(false) }}
                style={{ flex: 1, fontSize: 20, fontWeight: 700, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', color: 'var(--text)', outline: 'none' }}
              />
              <button className="btn" style={{ padding: '8px 12px' }} onClick={saveTitle}><Check size={16} /></button>
              <button className="btn ghost" style={{ padding: '8px 10px' }} onClick={() => setEditing(false)}><X size={16} /></button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 className="page-title" style={{ margin: 0 }}>{m.title}</h1>
              <button className="btn ghost" style={{ padding: 4 }} title="Rename" onClick={() => { setTitleDraft(m.title); setEditing(true) }}>
                <Pencil size={16} />
              </button>
            </div>
          )}
          <p className="page-sub">{date} · {mins} min · {m.language || 'auto'} · {m.sentiment}</p>
        </div>
        <button className="btn danger" onClick={del}><Trash2 size={15} /></button>
      </div>

      {/* Audio player */}
      {audioUrl && (
        <div className="card">
          <h2><Volume2 size={16} color="var(--brand)" /> Recording</h2>
          <audio controls src={audioUrl} style={{ width: '100%', marginTop: 12 }} />
        </div>
      )}

      {/* Summary */}
      <div className="card">
        <h2><FileText size={16} color="var(--brand)" /> Summary</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6, color: 'var(--text)' }}>{m.summary || '—'}</p>
      </div>

      {/* Action items */}
      {m.actionItems?.length > 0 && (
        <div className="card">
          <h2><CheckSquare size={16} color="var(--brand)" /> Action Items</h2>
          <ul style={{ marginTop: 10, paddingLeft: 2, listStyle: 'none' }}>
            {m.actionItems.map((a, i) => (
              <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                <span>{typeof a === 'string' ? a : a.task}</span>
                {a.owner && <span style={{ color: 'var(--muted)' }}> — {a.owner}</span>}
                {a.due && <span style={{ color: 'var(--brand)' }}> · {a.due}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key decisions */}
      {m.keyDecisions?.length > 0 && (
        <div className="card">
          <h2><Flag size={16} color="var(--brand)" /> Key Decisions</h2>
          <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
            {m.keyDecisions.map((d, i) => <li key={i}>{typeof d === 'string' ? d : d.decision}</li>)}
          </ul>
        </div>
      )}

      {/* Follow-ups */}
      {m.followUps?.length > 0 && (
        <div className="card">
          <h2><HelpCircle size={16} color="var(--brand)" /> Follow-up Questions</h2>
          <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
            {m.followUps.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}

      {/* Transcript */}
      <div className="card">
        <h2 style={{ cursor: 'pointer' }} onClick={() => setShowTranscript((v) => !v)}>
          <FileText size={16} color="var(--brand)" /> Transcript {showTranscript ? '▾' : '▸'}
        </h2>
        {showTranscript && (
          <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>
            {m.transcript || '—'}
          </pre>
        )}
      </div>

      {/* Email */}
      <div className="card">
        <h2><Mail size={16} color="var(--brand)" /> Email these notes</h2>
        <p className="hint">Comma-separated recipient emails. Summary + action items in the body; transcript attached; audio attached too if under 20&nbsp;MB.</p>
        <div className="field">
          <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="alice@acme.com, bob@acme.com" />
        </div>
        <button className="btn" style={{ marginTop: 4 }} onClick={emailNotes} disabled={sending}>
          {sending ? <><Loader2 size={15} className="spin" /> Sending…</> : <><Mail size={15} /> Send Notes</>}
        </button>
        {m.emailedTo?.length > 0 && <p className="hint" style={{ marginTop: 8 }}>Last emailed to: {m.emailedTo.join(', ')}</p>}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
