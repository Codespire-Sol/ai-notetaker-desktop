import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, ListVideo, ShieldCheck, Mic, LayoutDashboard, CalendarDays, Radio, X, RefreshCw, Download } from 'lucide-react'
import Lock from './pages/Lock.jsx'
import Settings from './pages/Settings.jsx'
import Meetings from './pages/Meetings.jsx'
import Record from './pages/Record.jsx'
import MeetingDetail from './pages/MeetingDetail.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Calendar from './pages/Calendar.jsx'
import logo from './assets/codespire-logo.png'

export default function App() {
  const [locked, setLocked] = useState(null)
  const [route, setRoute] = useState({ name: 'meetings', id: null })
  const [detected, setDetected] = useState(null)   // { app } when a call is detected (manual-prompt mode)
  const [updateReady, setUpdateReady] = useState(null)   // { version } once a new build is downloaded

  useEffect(() => {
    window.api.pinStatus().then((s) => setLocked(!!(s.enabled && s.isSet)))
  }, [])

  // Auto-update: the main process downloads a newer release in the background.
  useEffect(() => {
    const off = window.api.onUpdateReady((info) => setUpdateReady(info || {}))
    return () => off && off()
  }, [])

  // Meeting auto-detection: main process tells us when a call starts/ends.
  useEffect(() => {
    const offStart = window.api.onCallStarted((info) => {
      if (info?.autoRecord) setRoute({ name: 'record', id: null, autoStart: true })
      else setDetected(info || { app: '' })
    })
    const offEnd = window.api.onCallEnded(() => setDetected(null))
    return () => { offStart && offStart(); offEnd && offEnd() }
  }, [])

  if (locked === null) return null
  if (locked) return <Lock onUnlock={() => setLocked(false)} />

  const go = (name, id = null, extra = {}) => setRoute({ name, id, ...extra })
  const navActive = (n) => (route.name === n ? 'active' : '')

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo"><div className="logo-chip"><img src={logo} alt="Codespire" /></div></div>

        <button className={`nav-item ${navActive('dashboard')}`} onClick={() => go('dashboard')}>
          <LayoutDashboard size={17} /> Dashboard
        </button>
        <button className={`nav-item ${navActive('meetings')}`} onClick={() => go('meetings')}>
          <ListVideo size={17} /> Meetings
        </button>
        <button className={`nav-item ${navActive('calendar')}`} onClick={() => go('calendar')}>
          <CalendarDays size={17} /> Calendar
        </button>
        <button className={`nav-item ${navActive('record')}`} onClick={() => go('record')}>
          <Mic size={17} /> New Recording
        </button>
        <button className={`nav-item ${navActive('settings')}`} onClick={() => go('settings')}>
          <SettingsIcon size={17} /> Settings
        </button>

        <div className="spacer" />
        <div className="foot">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <ShieldCheck size={13} /> Runs locally
          </div>
          Codespire Notetaker v1.0.5
        </div>
      </aside>

      <main className="main">
        {/* A newer version has been downloaded and is ready to install */}
        {updateReady && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, margin: '16px 40px 0',
            padding: '12px 16px', background: 'var(--brand-soft)', border: '1px solid var(--brand)',
            borderRadius: 10, color: 'var(--text)'
          }}>
            <Download size={18} color="var(--brand)" />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
              Version {updateReady.version || 'update'} is ready to install.
            </span>
            <button className="btn" onClick={() => window.api.installUpdate()}>
              <RefreshCw size={15} /> Restart &amp; update
            </button>
            <button className="btn ghost" onClick={() => setUpdateReady(null)} title="Later"><X size={16} /></button>
          </div>
        )}

        {/* Meeting-detected banner (shown when auto-record is OFF) */}
        {detected && route.name !== 'record' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, margin: '16px 40px 0',
            padding: '12px 16px', background: 'var(--brand-soft)', border: '1px solid var(--brand)',
            borderRadius: 10, color: 'var(--text)'
          }}>
            <Radio size={18} className="pulse" color="var(--brand)" />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
              Meeting detected{detected.app ? ` (${detected.app})` : ''} — record it?
            </span>
            <button className="btn" onClick={() => { setDetected(null); go('record', null, { autoStart: true }) }}>
              <Mic size={15} /> Record
            </button>
            <button className="btn ghost" onClick={() => setDetected(null)} title="Dismiss"><X size={16} /></button>
          </div>
        )}

        {route.name === 'dashboard' && <Dashboard />}
        {route.name === 'meetings' && <Meetings onOpen={(id) => go('detail', id)} onRecord={() => go('record')} onGoSettings={() => go('settings')} />}
        {route.name === 'calendar' && <Calendar onGoSettings={() => go('settings')} />}
        {route.name === 'record' && <Record onDone={(id) => go('detail', id)} onCancel={() => go('meetings')} autoStart={!!route.autoStart} />}
        {route.name === 'detail' && <MeetingDetail id={route.id} onBack={() => go('meetings')} />}
        {route.name === 'settings' && <Settings />}
      </main>
    </div>
  )
}
