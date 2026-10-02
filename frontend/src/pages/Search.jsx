import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../store.jsx'
import { AppRow, Empty, ErrorBox, SkeletonRow } from '../components/UI.jsx'

const SORTS = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'popularity', label: 'Popularity' },
  { id: 'rating', label: 'Rating' },
  { id: 'newest', label: 'Newest' },
]

export default function Search() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [category, setCategory] = useState(params.get('category') || '')
  const [minRating, setMinRating] = useState(Number(params.get('min_rating') || 0))
  const [sort, setSort] = useState(params.get('sort') || 'relevance')
  const [cats, setCats] = useState([])
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { startDownload, toast } = useApp()
  const navigate = useNavigate()
  const debounceRef = useRef(null)
  const firstRender = useRef(true)

  useEffect(() => {
    api('/api/categories').then(setCats).catch(() => {})
  }, [])

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; run() }
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(run, q ? 320 : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category, minRating, sort])

  function run() {
    setBusy(true)
    setError('')
    const sp = new URLSearchParams()
    if (q.trim()) sp.set('q', q.trim())
    if (category) sp.set('category', category)
    if (minRating) sp.set('min_rating', String(minRating))
    sp.set('sort', sort)
    setParams(sp, { replace: true })
    api(`/api/search?${sp}`)
      .then((r) => setResults(r))
      .catch((e) => setError(e))
      .finally(() => setBusy(false))
  }

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
      <div className="field" style={{ marginBottom: 10 }}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search apps, developers, tags…"
          style={{ fontSize: 16, padding: '13px 16px' }}
        />
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 'auto', flex: 1, minWidth: 130 }}>
          <option value="">All categories</option>
          {cats.map(c => <option key={c.slug} value={c.slug}>{c.emoji} {c.name}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto', flex: 1, minWidth: 120 }}>
          {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[0, 3, 4, 4.5].map(r => (
          <button
            key={r}
            className={`tag ${minRating === r && r > 0 ? 'active' : ''}`}
            style={{
              cursor: 'pointer', border: 'none',
              background: minRating === r && r > 0 ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : undefined,
              color: minRating === r && r > 0 ? '#fff' : undefined,
            }}
            onClick={() => setMinRating(r)}
          >
            {r === 0 ? 'Any rating' : `★ ${r}+`}
          </button>
        ))}
      </div>

      {error && <ErrorBox error={error} />}

      {busy && !results ? (
        <div className="card">{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}</div>
      ) : results && results.items.length ? (
        <>
          <div className="muted tiny" style={{ margin: '2px 2px 8px' }}>
            {results.total} result{results.total === 1 ? '' : 's'} · {results.took_ms} ms
          </div>
          <div className="card" style={{ padding: 6 }}>
            {results.items.map(a => (
              <AppRow key={a.slug} app={a} onOpen={(x) => navigate(`/app/${x.slug}`)}
                right={<button className="btn-get" onClick={(e) => { e.stopPropagation(); get(a) }}>Get</button>} />
            ))}
          </div>
        </>
      ) : (
        results && (
          <Empty
            emoji="🔍"
            title={q ? `No results for “${q}”` : 'Find your next favorite app'}
            hint={q ? 'Try a different term or remove filters.' : 'Search by app name, developer, category, description or tag.'}
          />
        )
      )}
    </main>
  )
}
