import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtCount } from '../../api.js'
import { useApp } from '../../store.jsx'
import { ErrorBox } from '../../components/UI.jsx'
import DevNav from './DevNav.jsx'

function BecomeDeveloper() {
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { refreshUser, toast } = useApp()

  return (
    <main className="page">
      <div className="card center" style={{ padding: '30px 20px' }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🧑‍💻</div>
        <h1 style={{ margin: '0 0 6px', fontSize: 22 }}>Become a developer</h1>
        <p className="muted tiny" style={{ margin: '0 auto 18px', maxWidth: 340, lineHeight: 1.6 }}>
          Create app listings, upload releases through secure sessions, and publish to the whole marketplace.
        </p>
        <div style={{ textAlign: 'left', maxWidth: 380, margin: '0 auto' }}>
          {error && <div className="form-error">{error}</div>}
          <div className="field">
            <label className="label">Developer / studio name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northlight Labs" />
          </div>
          <div className="field">
            <label className="label">Website (optional)</label>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
          </div>
          <div className="field">
            <label className="label">Short bio (optional)</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What do you build?" />
          </div>
          <button
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={async () => {
              setBusy(true); setError('')
              try {
                await api('/api/developer', { method: 'POST', body: { name, website, bio } })
                await refreshUser()
                toast('Developer account active 🚀')
              } catch (e) { setError(e.detail) } finally { setBusy(false) }
            }}
          >
            Create developer profile
          </button>
        </div>
      </div>
    </main>
  )
}

export default function DevDashboard() {
  const { user } = useApp()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user?.developer) api('/api/developer/stats').then(setStats).catch(setError)
  }, [user])

  if (!user?.developer) return <BecomeDeveloper />

  const maxDl = Math.max(1, ...(stats?.recent_downloads || []).map(d => d.count))

  return (
    <main className="page">
      <div className="row between" style={{ margin: '8px 2px 4px' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 21, letterSpacing: '-0.02em' }}>Developer</div>
          <div className="muted tiny">{user.developer.name}</div>
        </div>
        <Link to="/dev/apps/new" className="btn btn-primary btn-sm">＋ Create app</Link>
      </div>

      <DevNav />

      {error && <ErrorBox error={error} />}
      {!stats ? (
        <div className="stat-grid">{Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 92, borderRadius: 18 }} />
        ))}</div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="num">⬇ {fmtCount(stats.total_downloads)}</div>
              <div className="lbl">Total downloads</div>
            </div>
            <div className="stat-card">
              <div className="num">📱 {stats.published_apps}<span className="muted" style={{ fontSize: 15 }}> / {stats.total_apps}</span></div>
              <div className="lbl">Published apps</div>
            </div>
            <div className="stat-card">
              <div className="num">🚀 {stats.active_releases}</div>
              <div className="lbl">Active releases (30d)</div>
            </div>
            <div className="stat-card">
              <div className="num">📤 {stats.recent_uploads.length}</div>
              <div className="lbl">Recent upload sessions</div>
            </div>
          </div>

          {stats.recent_downloads.length > 0 && (
            <>
              <div className="section-title"><h2>Downloads · last 14 days</h2></div>
              <div className="card">
                <div className="bar-chart">
                  {stats.recent_downloads.map(d => (
                    <div key={d.day} className="bar" style={{ height: `${(d.count / maxDl) * 100}%` }} title={`${d.day}: ${d.count}`} />
                  ))}
                </div>
                <div className="row between tiny muted" style={{ marginTop: 6 }}>
                  <span>{stats.recent_downloads[0]?.day}</span>
                  <span>{stats.recent_downloads.at(-1)?.day}</span>
                </div>
              </div>
            </>
          )}

          {stats.recent_uploads.length > 0 && (
            <>
              <div className="section-title"><h2>Recent uploads</h2></div>
              <div className="card" style={{ padding: 6 }}>
                {stats.recent_uploads.map((u, i) => (
                  <div key={i} className="app-row">
                    <div className="meta">
                      <div className="name" style={{ fontSize: 14 }}>{u.app_slug} · v{u.version}</div>
                      <div className="sub tiny">{new Date((u.created_at || '').replace(' ', 'T') + 'Z').toLocaleString()}</div>
                    </div>
                    <span className={`badge ${u.state}`}>{u.state}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="section-title"><h2>Quick actions</h2></div>
          <div className="stat-grid">
            <Link to="/dev/apps" className="stat-card" style={{ textDecoration: 'none' }}>
              <div style={{ fontSize: 26 }}>🗂️</div><div className="lbl">Manage my apps</div>
            </Link>
            <Link to="/dev/keys" className="stat-card" style={{ textDecoration: 'none' }}>
              <div style={{ fontSize: 26 }}>🔑</div><div className="lbl">API keys</div>
            </Link>
          </div>
        </>
      )}
    </main>
  )
}
