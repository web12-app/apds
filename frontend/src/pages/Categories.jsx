import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../store.jsx'
import { AppRow, Empty, ErrorBox, SkeletonRow } from '../components/UI.jsx'

export default function Categories() {
  const [cats, setCats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/categories').then(setCats).catch(setError)
  }, [])

  if (error) return <main className="page"><ErrorBox error={error} /></main>

  return (
    <main className="page">
      <h1 style={{ margin: '8px 2px 16px', fontSize: 24, letterSpacing: '-0.02em' }}>Categories</h1>
      {!cats ? (
        <div className="stat-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 96, borderRadius: 18 }} />
          ))}
        </div>
      ) : (
        <div className="stat-grid">
          {cats.map(c => {
            const [a, b] = c.gradient || ['#6366f1', '#8b5cf6']
            return (
              <Link key={c.slug} to={`/category/${c.slug}`} className="stat-card" style={{ textDecoration: 'none' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, display: 'grid', placeItems: 'center',
                  fontSize: 25, background: `linear-gradient(135deg, ${a}, ${b})`, marginBottom: 10,
                }}>{c.emoji}</div>
                <div style={{ fontWeight: 800 }}>{c.name}</div>
                <div className="tiny muted">{c.count} app{c.count === 1 ? '' : 's'}</div>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}

export function Category() {
  const { slug } = useParams()
  const [apps, setApps] = useState(null)
  const [cat, setCat] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { startDownload, toast } = useApp()

  useEffect(() => {
    setApps(null)
    Promise.all([api(`/api/apps?category=${slug}&limit=100`), api('/api/categories')])
      .then(([list, cats]) => {
        setApps(list.items)
        setCat(cats.find(c => c.slug === slug))
      })
      .catch(setError)
  }, [slug])

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
      <div className="row" style={{ margin: '8px 2px 14px' }}>
        <button className="iconbtn" onClick={() => navigate(-1)} aria-label="Back">←</button>
        <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.02em' }}>
          {cat ? `${cat.emoji} ${cat.name}` : slug}
        </h1>
      </div>
      {error && <ErrorBox error={error} />}
      {!apps ? (
        <div className="card">{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}</div>
      ) : apps.length ? (
        <div className="card" style={{ padding: 6 }}>
          {apps.map(a => (
            <AppRow key={a.slug} app={a} onOpen={(x) => navigate(`/app/${x.slug}`)}
              right={<button className="btn-get" onClick={(e) => { e.stopPropagation(); get(a) }}>Get</button>} />
          ))}
        </div>
      ) : (
        <Empty emoji="🗂️" title="No apps in this category yet"
          action={<Link className="btn btn-primary" to="/dev/apps/new">Publish the first one</Link>} />
      )}
    </main>
  )
}
