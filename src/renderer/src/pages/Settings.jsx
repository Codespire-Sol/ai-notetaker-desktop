import { useEffect, useState } from 'react'
import { KeyRound, Mail, Lock as LockIcon, Save, Video, Loader2, CheckCircle2, PlugZap, Eye, EyeOff, Radio, ToggleLeft, ToggleRight } from 'lucide-react'

const empty = {
  openaiKey: '', sarvamKey: '', msClientId: '',
  smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '' },
  summarizeModel: 'gpt-4o-mini', sttModel: 'saarika:v2.5', autoRecord: false
}

// Password input with a show/hide eye toggle
function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="pw-wrap">
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} />
      <button type="button" className="pw-toggle" tabIndex={-1} aria-label={show ? 'Hide' : 'Show'} onClick={() => setShow((v) => !v)}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

export default function Settings() {
  const [s, setS] = useState(empty)
  const [toast, setToast] = useState('')
  const [pinInfo, setPinInfo] = useState({ enabled: false, isSet: false })
  const [newPin, setNewPin] = useState('')
  const [teams, setTeams] = useState({ connected: false, email: null })
  const [teamsBusy, setTeamsBusy] = useState(false)
  const [smtpBusy, setSmtpBusy] = useState(false)

  useEffect(() => {
    window.api.getSettings().then((d) => setS({ ...empty, ...d, smtp: { ...empty.smtp, ...d.smtp } }))
    window.api.pinStatus().then(setPinInfo)
    window.api.teamsStatus().then(setTeams)
  }, [])

  const connectTeams = async () => {
    await window.api.saveSettings(s)   // ensure msClientId is saved first
    setTeamsBusy(true)
    const res = await window.api.connectTeams()
    setTeamsBusy(false)
    if (res.ok) { setTeams({ connected: true, email: res.email }); flash('Microsoft Teams connected') }
    else flash(res.error || 'Teams connection failed')
  }
  const disconnectTeams = async () => {
    await window.api.disconnectTeams()
    setTeams({ connected: false, email: null }); flash('Teams disconnected')
  }
  const toggleAutoRecord = async () => {
    const next = !s.autoRecord
    up('autoRecord', next)
    await window.api.saveSettings({ autoRecord: next })
    flash(next ? 'Auto-record enabled' : 'Auto-record disabled')
  }
  const testSmtp = async () => {
    setSmtpBusy(true)
    const res = await window.api.verifySmtp(s.smtp)
    setSmtpBusy(false)
    flash(res.ok ? 'SMTP connection OK ✓' : (res.error || 'SMTP verify failed'))
  }

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2200) }

  const save = async () => {
    await window.api.saveSettings(s)
    flash('Settings saved')
  }

  const savePin = async () => {
    const res = await window.api.setPin(newPin)
    if (res.ok) { setNewPin(''); setPinInfo({ enabled: true, isSet: true }); flash('PIN set') }
    else flash(res.error || 'Could not set PIN')
  }
  const removePin = async () => {
    await window.api.disablePin()
    setPinInfo({ enabled: false, isSet: false })
    flash('PIN removed')
  }

  const up = (k, v) => setS((p) => ({ ...p, [k]: v }))
  const upSmtp = (k, v) => setS((p) => ({ ...p, smtp: { ...p.smtp, [k]: v } }))

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Your keys stay on this machine. Nothing is uploaded except calls to OpenAI &amp; Sarvam.</p>
        </div>
        <button className="btn" onClick={save}><Save size={16} /> Save</button>
      </div>

      {/* AI providers */}
      <div className="card">
        <h2><KeyRound size={16} color="var(--brand)" /> AI Providers</h2>
        <p className="hint">Required to transcribe (Sarvam) and summarize (OpenAI).</p>
        <div className="field">
          <label>OpenAI API Key {s.openaiKey && <span className="badge ok">set</span>}</label>
          <PasswordInput value={s.openaiKey} onChange={(e) => up('openaiKey', e.target.value)} placeholder="sk-..." />
        </div>
        <div className="field">
          <label>Sarvam API Key {s.sarvamKey && <span className="badge ok">set</span>}</label>
          <PasswordInput value={s.sarvamKey} onChange={(e) => up('sarvamKey', e.target.value)} placeholder="sk_..." />
        </div>
        <div className="row">
          <div className="field">
            <label>Summarize model</label>
            <select value={s.summarizeModel} onChange={(e) => up('summarizeModel', e.target.value)}>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
            </select>
          </div>
          <div className="field">
            <label>Transcription model</label>
            <select value={s.sttModel} onChange={(e) => up('sttModel', e.target.value)}>
              <option value="saarika:v2.5">saarika:v2.5</option>
              <option value="saarika:flash">saarika:flash</option>
            </select>
          </div>
        </div>
      </div>

      {/* Microsoft Teams */}
      <div className="card">
        <h2><Video size={16} color="var(--brand)" /> Microsoft Teams</h2>
        <p className="hint">Optional. Connect to auto-label meetings and pull attendee emails from your calendar.</p>
        <div className="field">
          <label>Microsoft Client ID <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(Azure app registration)</span></label>
          <input value={s.msClientId} onChange={(e) => up('msClientId', e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          {teams.connected ? (
            <>
              <span className="badge ok"><CheckCircle2 size={11} style={{ verticalAlign: '-1px' }} /> {teams.email || 'Connected'}</span>
              <button className="btn secondary" onClick={disconnectTeams}>Disconnect</button>
            </>
          ) : (
            <button className="btn" onClick={connectTeams} disabled={teamsBusy || !s.msClientId}>
              {teamsBusy ? <><Loader2 size={15} className="spin" /> Waiting for sign-in…</> : <><Video size={15} /> Connect Teams</>}
            </button>
          )}
        </div>
      </div>

      {/* Meeting detection */}
      <div className="card">
        <h2><Radio size={16} color="var(--brand)" /> Meeting Detection</h2>
        <p className="hint">Auto-detect when a call starts (an app begins using your microphone) so you never forget to record.</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Auto-record detected meetings</div>
            <div className="hint" style={{ marginTop: 2 }}>
              {s.autoRecord ? 'Recording starts automatically when a call is detected.' : 'You’ll get a “Meeting detected — Record?” prompt instead.'}
            </div>
          </div>
          <button className="btn ghost" onClick={toggleAutoRecord} style={{ padding: 4 }}>
            {s.autoRecord ? <ToggleRight size={30} color="var(--brand)" /> : <ToggleLeft size={30} color="var(--muted)" />}
          </button>
        </div>
      </div>

      {/* SMTP */}
      <div className="card">
        <h2><Mail size={16} color="var(--brand)" /> Email (SMTP)</h2>
        <p className="hint">Used to email meeting notes to attendees.</p>
        <div className="row">
          <div className="field"><label>SMTP Host</label>
            <input value={s.smtp.host} onChange={(e) => upSmtp('host', e.target.value)} placeholder="smtp.office365.com" /></div>
          <div className="field" style={{ maxWidth: 120 }}><label>Port</label>
            <input type="number" value={s.smtp.port} onChange={(e) => upSmtp('port', Number(e.target.value))} /></div>
        </div>
        <div className="row">
          <div className="field"><label>Username</label>
            <input value={s.smtp.user} onChange={(e) => upSmtp('user', e.target.value)} placeholder="you@company.com" /></div>
          <div className="field"><label>Password</label>
            <PasswordInput value={s.smtp.pass} onChange={(e) => upSmtp('pass', e.target.value)} placeholder="••••••••" /></div>
        </div>
        <div className="field"><label>From address</label>
          <input value={s.smtp.from} onChange={(e) => upSmtp('from', e.target.value)} placeholder="you@company.com" /></div>
        <button className="btn secondary" style={{ marginTop: 14 }} onClick={testSmtp} disabled={smtpBusy}>
          {smtpBusy ? <><Loader2 size={15} className="spin" /> Testing…</> : <><PlugZap size={15} /> Test connection</>}
        </button>
      </div>

      {/* PIN */}
      <div className="card">
        <h2><LockIcon size={16} color="var(--brand)" /> App Lock (PIN)</h2>
        <p className="hint">Optional. Locks the app so others on this PC can't open it.</p>
        {pinInfo.enabled ? (
          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="badge ok">PIN enabled</span>
            <button className="btn secondary" onClick={removePin}>Remove PIN</button>
          </div>
        ) : (
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field"><label>Set a PIN (min 4 digits)</label>
              <input type="password" inputMode="numeric" value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" /></div>
            <button className="btn" style={{ marginBottom: 16 }} onClick={savePin} disabled={newPin.length < 4}>Enable</button>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
