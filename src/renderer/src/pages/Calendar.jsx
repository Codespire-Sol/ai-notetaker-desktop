import { useEffect, useState } from 'react'
import { CalendarDays, Clock, Users, RefreshCw, Video, ArrowRight, Languages } from 'lucide-react'

const LANGS = [
  { code: '', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'te', label: 'Telugu' },
  { code: 'ta', label: 'Tamil' },
  { code: 'mr', label: 'Marathi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'gu', label: 'Gujarati' },
]

export default function Calendar({ onGoSettings }) {
  const [status, setStatus] = useState(null) // { connected, email }
  const [meetings, setMeetings] = useState(null) // null=loading, []=empty, [...]
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.api.teamsStatus().then((s) => {
      setStatus(s || { connected: false, email: null })
      if (s?.connected) loadMeetings()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-poll every 5 minutes so newly-added meetings appear on their own
  // (desktop apps can't use Graph webhooks — no public endpoint — so we poll).
  useEffect(() => {
    if (!status?.connected) return
    const iv = setInterval(() => loadMeetings(true), 5 * 60 * 1000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected])

  const loadMeetings = async (silent = false) => {
    if (!silent) { setLoading(true); setMeetings(null) }
    setError('')
    try {
      const res = await window.api.teamsMeetings()
      if (res?.ok) {
        setMeetings(res.meetings || [])
      } else {
        if (!silent) { setError(res?.error || 'Could not load meetings'); setMeetings([]) }
      }
    } catch (e) {
      if (!silent) { setError(e?.message || 'Could not load meetings'); setMeetings([]) }
    }
    if (!silent) setLoading(false)
  }

  const setLang = async (meetingId, lang) => {
    setMeetings((ms) => (ms || []).map((m) => (m.id === meetingId ? { ...m, langPref: lang } : m)))
    await window.api.setMeetingLang(meetingId, lang)
  }

  const fmtRange = (startISO, endISO) => {
    const start = new Date(startISO)
    const end = new Date(endISO)
    const dateStr = start.toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric'
    })
    const t = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    return `${dateStr} · ${t(start)} – ${t(end)}`
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-sub">Your upcoming Microsoft Teams meetings.</p>
        </div>
        {status?.connected && (
          <button className="btn secondary" onClick={loadMeetings} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : undefined} /> Refresh
          </button>
        )}
      </div>

      {/* Initial status loading */}
      {status === null && <p className="page-sub" style={{ marginTop: 24 }}>Loading…</p>}

      {/* Not connected — empty state */}
      {status && !status.connected && (
        <div className="card" style={{ textAlign: 'center', padding: '54px 22px' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, var(--brand), var(--accent, #0EA5E9))',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <CalendarDays size={26} color="#fff" />
          </div>
          <h2 style={{ justifyContent: 'center' }}>Connect your Microsoft account</h2>
          <p className="hint" style={{ maxWidth: 420, margin: '6px auto 20px' }}>
            Connect your Microsoft/Teams account to see your upcoming meetings here and
            auto-fill attendee emails when sending notes.
          </p>
          <button className="btn" onClick={onGoSettings}>
            Go to Settings <ArrowRight size={15} />
          </button>
        </div>
      )}

      {/* Connected */}
      {status?.connected && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
            <span className="badge ok">{status.email || 'Connected'}</span>
          </div>

          {/* Loading meetings */}
          {loading && (
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <RefreshCw size={16} className="spin" color="var(--brand)" />
              <span className="hint" style={{ margin: 0 }}>Loading meetings…</span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="card">
              <div style={{ fontWeight: 600, color: 'var(--danger)' }}>Couldn’t load meetings</div>
              <p className="hint" style={{ marginTop: 6 }}>{error}</p>
              <p className="hint" style={{ marginTop: 4 }}>
                Reading your calendar may need the right permission granted to the app.
                Try reconnecting from Settings.
              </p>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && meetings?.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '40px 22px' }}>
              <CalendarDays size={26} color="var(--muted)" style={{ marginBottom: 10 }} />
              <p className="hint" style={{ margin: 0 }}>No upcoming meetings in the next 24 hours.</p>
            </div>
          )}

          {/* List */}
          {!loading && !error && meetings?.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {meetings.map((m) => (
                <div key={m.id} className="card" style={{ marginTop: 0, display: 'flex', gap: 14 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: 'var(--brand-soft)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <Video size={18} color="var(--brand)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 15 }}>{m.title || 'Untitled meeting'}</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12.5, marginTop: 4 }}>
                      <Clock size={13} /> {fmtRange(m.start, m.end)}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12.5, marginTop: 4 }}>
                      <Users size={13} /> {m.attendees?.length || 0} attendee{(m.attendees?.length || 0) === 1 ? '' : 's'}
                    </div>
                    {m.attendees?.length > 0 && (
                      <div style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 2, opacity: 0.85, wordBreak: 'break-word' }}>
                        {m.attendees.join(', ')}
                      </div>
                    )}

                    {m.organizer && (
                      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                        Organizer: {m.organizer}
                      </div>
                    )}

                    {/* Per-meeting recording language */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <Languages size={13} color="var(--brand)" />
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Recording language:</span>
                      <select
                        value={m.langPref || ''}
                        onChange={(e) => setLang(m.id, e.target.value)}
                        style={{ fontSize: 12, padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 6, background: '#fff', color: 'var(--text)', outline: 'none' }}
                      >
                        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {m.joinUrl && (
                    <a
                      className="btn secondary"
                      href={m.joinUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ alignSelf: 'flex-start', flexShrink: 0, textDecoration: 'none' }}
                    >
                      <Video size={15} /> Join
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
