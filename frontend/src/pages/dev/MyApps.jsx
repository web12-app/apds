import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, fmtCount, fmtDate } from '../../api.js'
import { useApp } from '../../store.jsx'
import { Empty, ErrorBox, Icon } from '../../components/UI.jsx'
import DevNav from './DevNav.jsx'

export default function MyApps() {
  const [apps, setApps] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { toast, user, refreshUser } = useApp()

  const load = () => api('/api/developer/apps').then(r => setApps(r.items)).catch(setError)
  useEffect(() => { if (user?.developer) load() }, [user])

  if (!user?.developer) return <main className="page"><Empty emoji="🧑‍💻" title="Become a developer first" action={<Link to="/dev" className="btn btn-primary">Create profile</Link>} /></main>

  const setStatus = async (slug, status) => {
    try {
      await api(`/api/apps/${slug}`, { method: 'PATCH', body: { status } })
      toast(status === 'published' ? 'App published 🎉' : `App ${status}`)
      load()
    } catch (e) { toast(e.detail, 'error') }
  }

  return (
    <main className="page">
      <div className="row between" style={{ margin: '8px 2px 4px' }}>
        <h1 style={{ margin: 0, fontSize: 21, letterSpacing: '-0.02em' }}>My apps</h1>
        <Link to="/dev/apps/new" className="btn btn-primary btn-sm">＋ Create</Link>
      </div>
      <DevNav />
      {error && <ErrorBox error={error} />}

      {!apps ? (
        <div className="skeleton" style={{ height: 200, borderRadius: 18 }} />
      ) : apps.length ? (
        <div className="stack">
          {apps.map(a => (
            <div key={a.slug} className="card">
              <div className="row" onClick={() => navigate(`/app/${a.slug}`)} style={{ cursor: 'pointer' }}>
                <Icon icon={a.icon} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{a.name} <span className={`badge ${a.status}`}>{a.status}</span></div>
                  <div className="tiny muted" style={{ marginTop: 3 }}>
                    {a.category} · ⬇ {fmtCount(a.downloads)} · ⭐ {a.rating || '—'} · updated {fmtDate(a.updated_at)}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    {a.versions?.length || 0} version{a.versions?.length === 1 ? '' : 's'}
                    {a.versions?.[0] ? ` · latest v${a.versions[0].version} (${a.versions[0].status})` : ''}
                  </div>
                </div>
              </div>
              <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                <Link to={`/dev/apps/${a.slug}/releases/new`} className="btn btn-primary btn-sm">📤 Upload release</Link>
                <Link to={`/dev/apps/${a.slug}/edit`} className="btn btn-ghost btn-sm">✏️ Edit</Link>
                {a.status === 'published' ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(a.slug, 'unpublished')}>Unpublish</button>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(a.slug, 'published')}>Publish</button>
                )}
                <span style={{ flex: 1 }} />
                <Link to={`/app/${a.slug}`} className="btn btn-ghost btn-sm">View in store ↗</Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          emoji="🗂️" title="No apps yet"
          hint="Create your first app listing — it only takes a minute."
          action={<Link to="/dev/apps/new" className="btn btn-primary">Create an app</Link>}
        />
      )}
    </main>
  )
}
