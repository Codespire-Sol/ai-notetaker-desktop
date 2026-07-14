import { useEffect, useState } from 'react'
import { IndianRupee, Coins, Activity, ListVideo, BarChart3, Clock, Cpu } from 'lucide-react'

// ── format helpers ───────────────────────────────────────────────────────
const fmtTokens = (n) => {
  const v = Number(n) || 0
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(v)
}
const fmtCost = (n) => '₹' + (Number(n) || 0).toFixed(2)
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-IN')

// ── horizontal bar row ───────────────────────────────────────────────────
function BarRow({ name, cost, maxCost, total }) {
  const pct = total > 0 ? (cost / total) * 100 : 0
  const width = maxCost > 0 ? (cost / maxCost) * 100 : 0
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>{name}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {fmtCost(cost)} <span style={{ color: 'var(--faint)' }}>· {pct.toFixed(1)}%</span>
        </span>
      </div>
      <div style={{ height: 9, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${width}%`, height: '100%', background: 'var(--brand)', borderRadius: 999, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────
function Kpi({ icon, label, value }) {
  return (
    <div className="card" style={{ margin: 0, flex: 1, minWidth: 140, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12.5, fontWeight: 600 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginTop: 10, letterSpacing: '-.02em' }}>{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [meetingCount, setMeetingCount] = useState(null)

  useEffect(() => {
    window.api.usageStats().then(setStats).catch(() => setStats({}))
    window.api.listMeetings?.().then((m) => setMeetingCount(Array.isArray(m) ? m.length : 0)).catch(() => {})
  }, [])

  if (stats === null) {
    return (
      <div className="content">
        <h1 className="page-title">AI Dashboard</h1>
        <p className="page-sub">Monitor AI usage, cost, and tokens</p>
        <div className="card"><p className="hint">Loading analytics…</p></div>
      </div>
    )
  }

  const {
    totalMeetings = 0, totalCost = 0, totalTokens = 0, totalCalls = 0,
    byProvider = [], byOperation = [], recent = []
  } = stats

  const meetings = totalMeetings || meetingCount || 0
  const maxProvider = Math.max(0, ...byProvider.map((p) => p.cost || 0))
  const maxOperation = Math.max(0, ...byOperation.map((o) => o.cost || 0))
  const provTotal = byProvider.reduce((s, p) => s + (p.cost || 0), 0) || totalCost
  const opTotal = byOperation.reduce((s, o) => s + (o.cost || 0), 0) || totalCost

  return (
    <div className="content">
      <h1 className="page-title">AI Dashboard</h1>
      <p className="page-sub">Monitor AI usage, cost, and tokens</p>

      {totalCalls === 0 ? (
        <div className="card">
          <h2><BarChart3 size={16} color="var(--brand)" /> No data yet</h2>
          <p className="hint" style={{ marginTop: 8 }}>No AI usage yet — record a meeting to see analytics.</p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: 'flex', gap: 14, marginTop: 20, flexWrap: 'wrap' }}>
            <Kpi icon={<IndianRupee size={15} color="var(--brand)" />} label="Total Cost" value={fmtCost(totalCost)} />
            <Kpi icon={<Coins size={15} color="var(--brand)" />} label="Total Tokens" value={fmtTokens(totalTokens)} />
            <Kpi icon={<Activity size={15} color="var(--brand)" />} label="API Calls" value={fmtNum(totalCalls)} />
            <Kpi icon={<ListVideo size={15} color="var(--brand)" />} label="Meetings" value={fmtNum(meetings)} />
          </div>

          {/* Cost by provider */}
          <div className="card">
            <h2><BarChart3 size={16} color="var(--brand)" /> Cost by Provider</h2>
            {byProvider.length === 0 ? (
              <p className="hint" style={{ marginTop: 8 }}>No provider data.</p>
            ) : (
              byProvider.map((p) => (
                <BarRow key={p.name} name={p.name} cost={p.cost || 0} maxCost={maxProvider} total={provTotal} />
              ))
            )}
          </div>

          {/* Usage by operation */}
          <div className="card">
            <h2><Cpu size={16} color="var(--brand)" /> Usage by Operation</h2>
            {byOperation.length === 0 ? (
              <p className="hint" style={{ marginTop: 8 }}>No operation data.</p>
            ) : (
              byOperation.map((o) => (
                <BarRow key={o.name} name={o.name} cost={o.cost || 0} maxCost={maxOperation} total={opTotal} />
              ))
            )}
          </div>

          {/* Recent activity */}
          <div className="card">
            <h2><Clock size={16} color="var(--brand)" /> Recent Activity</h2>
            {recent.length === 0 ? (
              <p className="hint" style={{ marginTop: 8 }}>No recent activity.</p>
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                      {['Date', 'Provider', 'Model', 'Operation', 'Tokens', 'Cost'].map((h, i) => (
                        <th key={h} style={{ padding: '8px 10px 10px 0', fontWeight: 600, fontSize: 12,
                          textAlign: i >= 4 ? 'right' : 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 10px 9px 0', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {r.at ? new Date(r.at).toLocaleString() : '—'}
                        </td>
                        <td style={{ padding: '9px 10px 9px 0', color: 'var(--text)', textTransform: 'capitalize' }}>{r.provider || '—'}</td>
                        <td style={{ padding: '9px 10px 9px 0', color: 'var(--muted)' }}>{r.model || '—'}</td>
                        <td style={{ padding: '9px 10px 9px 0', color: 'var(--text)', textTransform: 'capitalize' }}>{r.operation || '—'}</td>
                        <td style={{ padding: '9px 0 9px 10px', color: 'var(--muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtTokens(r.tokens)}</td>
                        <td style={{ padding: '9px 0 9px 10px', color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtCost(r.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
