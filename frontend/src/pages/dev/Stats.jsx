import React, { useEffect, useState } from 'react'
import { api, fmtCount, fmtDate } from '../../api.js'
import { useApp } from '../../store.jsx'
import { ErrorBox, Icon } from '../../components/UI.jsx'
import DevNav from './DevNav.jsx'

export default function Stats() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const { user } = useApp()

  useEffect(() => {
    if (user?.developer) api('/api/developer/stats').then(setStats).catch(setError)
  }, [user])

  if (!user?.developer) return <main className="page"><ErrorBox error={{ detail: 'Become a developer first.' }} /></main>
  if (error) return <main className="page"><ErrorBox error={error} /></main>

  const max = Math.max(1, ...(stats?.per_app || []).map(p => p.downloads))
  const maxDl = Math.max(1, ...(stats?.recent_downloads || []).map(d => d.count))

  return (
    <main className="page">
      <h1 style={{ margin: '8px 2px 14px', fontSize: 22, letterSpacing: '-0.02em' }}>Statistics</h1>
      <DevNav />

      {!stats ? (
        <div className="skeleton" style={{ height: 260, borderRadius: 18 }} />
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <div className="stat-card"><div className="num">⬇ {fmtCount(stats.total_downloads)}</div><div className="lbl">Total downloads</div></div>
            <div className="stat-card"><div className="num">⭐ {(stats.per_app || []).reduce((s, p) => s + (p.ratings_count || 0), 0)}</div><div className="lbl">Total ratings</div></div>
          </div>

          {stats.recent_downloads.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Downloads · last 14 days</div>
              <div className="bar-chart">
                {stats.recent_downloads.map(d => (
                  <div key={d.day} className="bar" style={{ height: `${(d.count / maxDl) * 100}%` }} title={`${d.day}: ${d.count}`} />
                ))}
              </div>
            </div>
          )}

          <div className="section-title"><h2>Per app</h2></div>
          {stats.per_app.length ? (
            <div className="stack">
              {stats.per_app.map(p => (
                <div key={p.slug} className="card">
                  <div className="row between">
                    <div style={{ minWidth: 0 }}>
                      <Link to={`/app/${p.slug}`} style={{ fontWeight: 800 }}>{p.name}</Link>
                      <div className="tiny muted" style={{ marginTop: 2 }}>
                        {p.versions} version{p.versions === 1 ? '' : 's'} · ⭐ {p.rating || '—'} ({fmtCount(p.ratings_count)}) · updated {fmtDate(p.updated_at)}
                      </div>
                    </div>
                    <span className={`badge ${p.status}`}>{p.status}</span>
                  </div>
                  <div className="progress" style={{ marginTop: 12, height: 12 }}>
                    <div style={{ width: `${(p.downloads / max) * 100}%` }} />
                  </div>
                  <div className="tiny muted" style={{ marginTop: 5 }}>⬇ {fmtCount(p.downloads)} downloads</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty"><div className="big">📊</div>No apps to analyze yet.</div>
          )}
        </>
      )}
    </main>
  )
}
