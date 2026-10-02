import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../store.jsx'
import { AppRow, Empty, ErrorBox, Icon } from '../components/UI.jsx'

export default function Library() {
  const [tab, setTab] = useState('installed')
  const [lib, setLib] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { startDownload, toast, user } = useApp()

  const load = () => api('/api/library').then(setLib).catch(setError)
  useEffect(() => { load() }, [])

  const items = lib ? (tab === 'installed' ? lib.installed : lib.wishlist) : null

  const get = (app) => {
    api(`/api/apps/${app.slug}`)
      .then((d) => {
        const v = d.versions?.find(v => v.status === 'published')
        if (!v) return toast('No published version yet', 'error')
        startDownload(d, v)
      })
      .catch((e) => toast(e.detail || 'Unable to start download', 'error'))
  }

  return (
    <main className="page">
      <h1 style={{ margin: '8px 2px 14px', fontSize: 24, letterSpacing: '-0.02em' }}>Library</h1>
      <div className="tabs">
        <button className={tab === 'installed' ? 'active' : ''} onClick={() => setTab('installed')}>
          Installed {lib ? `(${lib.installed.length})` : ''}
        </button>
        <button className={tab === 'wishlist' ? 'active' : ''} onClick={() => setTab('wishlist')}>
          Wishlist {lib ? `(${lib.wishlist.length})` : ''}
        </button>
      </div>

      {error && <ErrorBox error={error} />}

      {!items ? (
        <div className="skeleton" style={{ height: 220, borderRadius: 18 }} />
      ) : items.length ? (
        <div className="card" style={{ padding: 6 }}>
          {items.map(a => (
            <div key={a.slug} className="app-row" onClick={() => navigate(`/app/${a.slug}`)}>
              <Icon icon={a.icon} />
              <div className="meta">
                <div className="name">{a.name}</div>
                <div className="sub tiny">
                  {a.developer}
                  {tab === 'installed' && a.version ? ` · v${a.version}` : ''}
                </div>
              </div>
              {tab === 'wishlist' && (
                <button
                  className="btn-get"
                  onClick={async (e) => {
                    e.stopPropagation()
                    try {
                      await api(`/api/apps/${a.slug}/wishlist`, { method: 'POST', body: { added: false } })
                      toast('Removed from wishlist')
                      load()
                    } catch (err) { toast(err.detail, 'error') }
                  }}
                >
                  Remove
                </button>
              )}
              <button className="btn-get" onClick={(e) => { e.stopPropagation(); get(a) }}>
                {tab === 'installed' ? 'Update' : 'Get'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          emoji={tab === 'installed' ? '📦' : '🤍'}
          title={tab === 'installed' ? 'No apps installed yet' : 'Your wishlist is empty'}
          hint={tab === 'installed' ? 'Apps you download will appear here.' : 'Tap the heart on any app to save it.'}
          action={<a href="#/home" className="btn btn-primary" onClick={(e) => { e.preventDefault(); navigate('/home') }}>Browse the store</a>}
        />
      )}
    </main>
  )
}
