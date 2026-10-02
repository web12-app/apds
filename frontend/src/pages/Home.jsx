import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../store.jsx'
import { AppCard, AppRow, Empty, ErrorBox, FeatureCard, SkeletonCards, SkeletonRow } from '../components/UI.jsx'

export default function Home() {
  const [apps, setApps] = useState(null)
  const [cats, setCats] = useState([])
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { user, startDownload, toast } = useApp()

  useEffect(() => {
    ;(async () => {
      try {
        const [list, categories] = await Promise.all([
          api('/api/apps?limit=100'),
          api('/api/categories'),
        ])
        setApps(list.items)
        setCats(categories)
      } catch (err) {
        setError(err)
      }
    })()
  }, [])

  const featured = useMemo(() => (apps || []).filter(a => a.featured), [apps])
  const trending = useMemo(() => (apps || []).filter(a => a.trending), [apps])
  const fresh = useMemo(
    () => [...(apps || [])].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 10),
    [apps],
  )
  const popular = useMemo(
    () => [...(apps || [])].sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, 8),
    [apps],
  )

  const open = (app) => navigate(`/app/${app.slug}`)
  const get = (app) => {
    // quick "Get" downloads the latest version via details lookup
    api(`/api/apps/${app.slug}`)
      .then((d) => {
        const v = d.versions?.find(v => v.status === 'published')
        if (!v) return toast('No published version yet', 'error')
        startDownload(d, v)
      })
      .catch((e) => toast(e.detail || 'Unable to start download', 'error'))
  }

  const greeting = () => {
    const h = new Date().getHours()
    const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
    return user ? `${part}, ${user.username}` : part
  }

  if (error) return <main className="page"><ErrorBox error={error} /></main>

  return (
    <main className="page">
      <div className="row between" style={{ margin: '8px 2px 4px' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 21, letterSpacing: '-0.02em' }}>{greeting()}</div>
          <div className="muted tiny">Discover something great today</div>
        </div>
        <Link to="/categories" className="btn btn-ghost btn-sm">All categories</Link>
      </div>

      {/* categories */}
      <div className="cat-chips" style={{ marginTop: 12 }}>
        {cats.map(c => (
          <Link key={c.slug} to={`/category/${c.slug}`}>{c.emoji} {c.name}</Link>
        ))}
      </div>

      {/* featured */}
      <div className="section-title"><h2>Featured</h2><Link to="/search">See all</Link></div>
      {!apps ? <SkeletonCards /> : featured.length ? (
        <div className="carousel">
          {featured.map(a => <FeatureCard key={a.slug} app={a} onOpen={open} onGet={get} />)}
        </div>
      ) : <Empty emoji="✨" title="Nothing featured yet" />}

      {/* trending */}
      <div className="section-title"><h2>Trending</h2><span className="muted tiny">🔥 hot right now</span></div>
      {!apps ? <SkeletonCards /> : (
        <div className="carousel">
          {trending.map(a => <AppCard key={a.slug} app={a} onOpen={open} onGet={get} />)}
        </div>
      )}

      {/* new releases */}
      <div className="section-title"><h2>New releases</h2></div>
      {!apps ? <SkeletonCards /> : (
        <div className="carousel">
          {fresh.map(a => <AppCard key={a.slug} app={a} onOpen={open} onGet={get} />)}
        </div>
      )}

      {/* popular */}
      <div className="section-title"><h2>Most popular</h2></div>
      {!apps ? (
        <div className="card">{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}</div>
      ) : (
        <div className="card" style={{ padding: 6 }}>
          {popular.map(a => <AppRow key={a.slug} app={a} onOpen={open}
            right={<button className="btn-get" onClick={(e) => { e.stopPropagation(); get(a) }}>Get</button>} />)}
        </div>
      )}

      {/* per-category rows */}
      {cats.slice(0, 7).map(c => {
        const items = (apps || []).filter(a => a.category === c.slug)
        if (!items.length) return null
        return (
          <div key={c.slug}>
            <div className="section-title">
              <h2>{c.emoji} {c.name}</h2>
              <Link to={`/category/${c.slug}`}>See all</Link>
            </div>
            {apps ? (
              <div className="carousel">
                {items.map(a => <AppCard key={a.slug} app={a} onOpen={open} onGet={get} />)}
              </div>
            ) : <SkeletonCards n={3} />}
          </div>
        )
      })}
    </main>
  )
}
