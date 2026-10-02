import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fmtCount, fmtDate, fmtSize } from '../api.js'
import { useApp } from '../store.jsx'
import { Empty, ErrorBox, Icon, KV, ProgressBar, Shot, Stars } from '../components/UI.jsx'

function ReviewForm({ slug, onDone }) {
  const [rating, setRating] = useState(5)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { toast } = useApp()

  return (
    <div style={{ padding: '6px 0' }}>
      {error && <div className="form-error">{error}</div>}
      <div className="row" style={{ gap: 4, margin: '8px 0' }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} className="iconbtn" style={{ fontSize: 24, color: n <= rating ? '#f59e0b' : 'var(--text-3)' }}
            onClick={() => setRating(n)} aria-label={`${n} stars`}>★</button>
        ))}
      </div>
      <div className="field">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" />
      </div>
      <div className="field">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What do you think?" />
      </div>
      <button
        className="btn btn-primary btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true); setError('')
          try {
            await api(`/api/apps/${slug}/reviews`, { method: 'POST', body: { rating, title, body } })
            toast('Review published ⭐')
            onDone()
          } catch (e) {
            setError(e.detail)
          } finally { setBusy(false) }
        }}
      >
        Publish review
      </button>
    </div>
  )
}

export default function AppDetails() {
  const { slug } = useParams()
  const [app, setApp] = useState(null)
  const [error, setError] = useState('')
  const [wished, setWished] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const { user, startDownload, toast, downloads } = useApp()
  const navigate = useNavigate()

  const load = () => api(`/api/apps/${slug}`).then(setApp).catch(setError)
  useEffect(() => { setApp(null); setError(''); load() }, [slug])

  useEffect(() => {
    if (!user) return
    api('/api/library')
      .then((l) => setWished(l.wishlist.some(a => a.slug === slug)))
      .catch(() => {})
  }, [user, slug])

  if (error) {
    return (
      <main className="page">
        <ErrorBox error={error} />
        <Empty emoji="🫥" title="This app is not available" action={<Link to="/home" className="btn btn-primary">Back to store</Link>} />
      </main>
    )
  }
  if (!app) {
    return (
      <main className="page">
        <div className="row" style={{ gap: 16 }}>
          <div className="skeleton" style={{ width: 84, height: 84, borderRadius: 22 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 14, width: '40%' }} />
          </div>
        </div>
        <div className="skeleton" style={{ height: 120, marginTop: 18, borderRadius: 18 }} />
        <div className="skeleton" style={{ height: 240, marginTop: 14, borderRadius: 18 }} />
      </main>
    )
  }

  const latest = app.versions?.find(v => v.status === 'published') || app.versions?.[0]
  const activeDl = downloads.find(d => d.slug === slug && d.status === 'downloading')

  const download = (v) => {
    if (!v || v.status !== 'published') return toast('This version is not published yet', 'error')
    startDownload(app, v)
  }

  const share = async () => {
    const url = `${location.origin}/app/${slug}`
    if (navigator.share) {
      try { await navigator.share({ title: app.name, url }); return } catch { /* canceled */ }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copied 🔗') } catch { toast(url) }
  }

  const toggleWishlist = async () => {
    if (!user) return navigate('/login', { state: { from: `/app/${slug}` } })
    try {
      const r = await api(`/api/apps/${slug}/wishlist`, { method: 'POST', body: { added: !wished } })
      setWished(r.added)
      toast(r.added ? 'Added to wishlist ❤️' : 'Removed from wishlist')
    } catch (e) { toast(e.detail, 'error') }
  }

  const myReview = user && app.reviews?.some(r => r.user === user.username)

  return (
    <main className="page">
      {/* header */}
      <div className="row" style={{ gap: 16, alignItems: 'flex-start', marginTop: 6 }}>
        <Icon icon={app.icon} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.02em' }}>{app.name}</h1>
          <div className="muted tiny" style={{ marginTop: 3 }}>{app.developer}</div>
          <div className="row tiny muted" style={{ gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <span><Stars rating={app.rating} /> {app.rating ? Number(app.rating).toFixed(1) : '—'} ({fmtCount(app.ratings_count)})</span>
            <span>⬇ {fmtCount(app.downloads)}</span>
            <span className="tag">{app.category}</span>
            {app.age_rating && <span className="tag">{app.age_rating}</span>}
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="row" style={{ gap: 10, margin: '18px 0 6px' }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => download(latest)}>
          {activeDl ? `Downloading ${activeDl.pct}%` : latest?.status === 'published' ? '⬇ Download' : 'Unavailable'}
        </button>
        <button className="btn btn-ghost" onClick={toggleWishlist} aria-label="Wishlist"
          style={{ color: wished ? '#ef4444' : undefined }}>
          {wished ? '❤️' : '🤍'}
        </button>
        <button className="btn btn-ghost" onClick={share} aria-label="Share">↗</button>
      </div>
      {activeDl && <ProgressBar pct={activeDl.pct} />}

      {/* screenshots */}
      {app.screenshots?.length > 0 && (
        <div className="carousel" style={{ marginTop: 14 }}>
          {app.screenshots.map((s, i) => <Shot key={i} shot={s} />)}
        </div>
      )}

      {/* about */}
      <div className="section-title"><h2>About this app</h2></div>
      <div className="card">
        <p style={{ margin: 0, lineHeight: 1.65, whiteSpace: 'pre-line' }}>{app.description}</p>
        {app.tags?.length > 0 && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {app.tags.map(t => <Link key={t} to={`/search?q=${t}`} className="tag">#{t}</Link>)}
          </div>
        )}
      </div>

      {/* info */}
      <div className="section-title"><h2>App information</h2></div>
      <div className="card">
        <KV rows={[
          ['Version', latest ? `v${latest.version}` : '—'],
          ['Updated', fmtDate(app.updated_at)],
          ['Size', latest ? fmtSize(latest.size_kb) : '—'],
          ['Minimum OS', latest?.min_os || '—'],
          ['Permissions', app.permissions?.join(', ') || '—'],
          ['Package', app.package_id || '—'],
        ]} />
      </div>

      {/* what's new */}
      {latest?.notes && (
        <>
          <div className="section-title"><h2>What's new</h2><span className="tiny muted">v{latest.version}</span></div>
          <div className="card"><p style={{ margin: 0, lineHeight: 1.6 }}>{latest.notes}</p></div>
        </>
      )}

      {/* versions */}
      {app.versions?.length > 0 && (
        <>
          <div className="section-title"><h2>Versions</h2></div>
          <div className="card" style={{ padding: 6 }}>
            {app.versions.map(v => (
              <div key={v.version} className="app-row">
                <div className="meta">
                  <div className="name">v{v.version}</div>
                  <div className="sub tiny">
                    {fmtDate(v.published_at || v.created_at)} · {fmtSize(v.size_kb)} · {fmtCount(v.downloads || 0)} downloads
                  </div>
                </div>
                {v.status === 'published' ? (
                  <button className="btn-get" onClick={() => download(v)}>Get</button>
                ) : <span className="badge draft">{v.status}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* reviews */}
      <div className="section-title">
        <h2>Ratings & reviews</h2>
        {user && !myReview && (
          <a href="#review" onClick={(e) => { e.preventDefault(); setShowReview(s => !s) }}>
            {showReview ? 'Cancel' : 'Write a review'}
          </a>
        )}
      </div>
      {showReview && <div className="card" style={{ marginBottom: 12 }}><ReviewForm slug={slug} onDone={() => { setShowReview(false); load() }} /></div>}
      <div className="card" style={{ padding: 6 }}>
        {app.reviews?.length ? app.reviews.map(r => (
          <div key={r.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
            <div className="row between">
              <strong style={{ fontSize: 14 }}>{r.title || 'Review'}</strong>
              <Stars rating={r.rating} />
            </div>
            <div className="muted tiny" style={{ margin: '3px 0 6px' }}>{r.user} · {fmtDate(r.created_at)}</div>
            <div style={{ fontSize: 14, lineHeight: 1.55 }}>{r.body}</div>
          </div>
        )) : (
          <Empty emoji="⭐" title="No reviews yet" hint="Be the first to share what you think." />
        )}
      </div>

      {/* developer */}
      <div className="section-title"><h2>Developer</h2></div>
      <div className="card">
        <div className="row">
          <div className="icon-badge sm" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>🏗️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{app.developer_info?.name || app.developer}</div>
            {app.developer_info?.website && (
              <a href={app.developer_info.website} target="_blank" rel="noreferrer" className="tiny" style={{ color: 'var(--brand1)' }}>
                {app.developer_info.website.replace(/^https?:\/\//, '')} ↗
              </a>
            )}
          </div>
        </div>
        {app.developer_info?.other_apps?.length > 0 && (
          <>
            <div className="divider" />
            <div className="tiny muted" style={{ marginBottom: 6 }}>More from this developer</div>
            {app.developer_info.other_apps.map(a => (
              <div key={a.slug} className="app-row" onClick={() => navigate(`/app/${a.slug}`)}>
                <Icon icon={a.icon} size="sm" />
                <div className="meta">
                  <div className="name" style={{ fontSize: 14 }}>{a.name}</div>
                  <div className="sub tiny">⭐ {a.rating || '—'} · ⬇ {fmtCount(a.downloads)}</div>
                </div>
                <span className="muted">›</span>
              </div>
            ))}
          </>
        )}
      </div>
    </main>
  )
}
