import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useApp } from '../store.jsx'
import { Empty, ErrorBox } from '../components/UI.jsx'

const ICONS = { welcome: '👋', app: '📱', release: '🚀', upload: '📤', security: '🔐', developer: '🧑‍💻', info: '🔔' }

export default function Notifications() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const { refreshUser } = useApp()

  useEffect(() => {
    api('/api/notifications')
      .then(setData)
      .catch(setError)
      .then(() => api('/api/notifications/read', { method: 'POST' }).then(refreshUser).catch(() => {}))
  }, [])

  if (error) return <main className="page"><ErrorBox error={error} /></main>

  return (
    <main className="page">
      <h1 style={{ margin: '8px 2px 14px', fontSize: 24, letterSpacing: '-0.02em' }}>Notifications</h1>
      {!data ? (
        <div className="skeleton" style={{ height: 200, borderRadius: 18 }} />
      ) : data.items.length ? (
        <div className="stack">
          {data.items.map(n => (
            <div key={n.id} className="card row" style={{ padding: '14px 16px', gap: 13, opacity: n.read_at ? 0.62 : 1 }}>
              <div className="icon-badge sm" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                {ICONS[n.kind] || '🔔'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{n.title}</div>
                {n.body && <div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.5 }}>{n.body}</div>}
                <div className="tiny" style={{ color: 'var(--text-3)', marginTop: 4 }}>{new Date(n.created_at + 'Z').toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty emoji="🔔" title="You're all caught up" hint="Platform and release updates will show up here." />
      )}
    </main>
  )
}
