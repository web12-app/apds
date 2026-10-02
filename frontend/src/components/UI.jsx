import React, { useEffect, useRef, useState } from 'react'
import { fmtCount, fmtDate, fmtSize } from '../api.js'

/* App icon: gradient+emoji, or uploaded image served by the API */
export function Icon({ icon, size = '' }) {
  if (!icon) icon = { type: 'gradient', emoji: '📦', gradient: ['#6366f1', '#8b5cf6'] }
  const cls = `icon-badge ${size}`
  if (icon.type === 'image' && icon.path) {
    return (
      <div className={cls}>
        <img src={`/api/${icon.path}`} alt="" loading="lazy" />
      </div>
    )
  }
  const [a, b] = icon.gradient && icon.gradient.length >= 2 ? icon.gradient : ['#6366f1', '#8b5cf6']
  return (
    <div className={cls} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
      {icon.emoji || '📦'}
    </div>
  )
}

export function Stars({ rating }) {
  const full = Math.round(rating)
  return (
    <span className="stars" aria-label={`${rating} out of 5`}>
      {'★'.repeat(full)}<span className="muted">{'★'.repeat(5 - full)}</span>
    </span>
  )
}

export function SkeletonRow() {
  return (
    <div className="app-row">
      <div className="skeleton" style={{ width: 56, height: 56, borderRadius: 15 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton" style={{ height: 15, width: '55%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 12, width: '35%' }} />
      </div>
      <div className="skeleton" style={{ width: 68, height: 32, borderRadius: 999 }} />
    </div>
  )
}

export function SkeletonCards({ n = 4 }) {
  return (
    <div className="carousel">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="app-card">
          <div className="skeleton" style={{ width: 56, height: 56, borderRadius: 15 }} />
          <div className="skeleton" style={{ height: 14, width: '80%', marginTop: 10 }} />
          <div className="skeleton" style={{ height: 12, width: '50%', marginTop: 7 }} />
        </div>
      ))}
    </div>
  )
}

export function Empty({ emoji = '🗂️', title, hint, action }) {
  return (
    <div className="empty">
      <div className="big">{emoji}</div>
      <div style={{ fontWeight: 700, marginBottom: 5 }}>{title}</div>
      {hint && <div className="tiny">{hint}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

export function ErrorBox({ error }) {
  if (!error) return null
  return <div className="error-box">{error.detail || String(error)}</div>
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const fn = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="row between" style={{ marginBottom: 14 }}>
          <strong style={{ fontSize: 17 }}>{title}</strong>
          <button className="iconbtn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* one app in a list (store rows, search results, library…) */
export function AppRow({ app, onOpen, right }) {
  return (
    <div className="app-row" onClick={() => onOpen(app)}>
      <Icon icon={app.icon} />
      <div className="meta">
        <div className="name">{app.name}</div>
        <div className="sub">
          <span>{app.developer}</span>
          <span>·</span>
          <Stars rating={app.rating || 0} />
          <span>{app.rating ? Number(app.rating).toFixed(1) : '—'}</span>
        </div>
        <div className="sub tiny">
          {fmtCount(app.downloads)} downloads
          {app.version ? ` · v${app.version}` : ''}
        </div>
      </div>
      {right}
    </div>
  )
}

/* small card for carousels */
export function AppCard({ app, onOpen, onGet }) {
  return (
    <div className="app-card" onClick={() => onOpen(app)}>
      <Icon icon={app.icon} />
      <div className="name">{app.name}</div>
      <div className="sub">{app.developer}</div>
      <div className="rate">
        <Stars rating={app.rating || 0} />
        {app.rating ? Number(app.rating).toFixed(1) : 'New'}
      </div>
      {onGet && (
        <button
          className="btn-get"
          style={{ marginTop: 8 }}
          onClick={(e) => { e.stopPropagation(); onGet(app) }}
        >
          Get
        </button>
      )}
    </div>
  )
}

/* big featured card */
export function FeatureCard({ app, onOpen, onGet }) {
  const [a, b] = app.icon?.gradient || ['#6366f1', '#8b5cf6']
  return (
    <div className="feature-card" onClick={() => onOpen(app)}>
      <div className="fc-art" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
        {app.icon?.emoji || '📦'}
      </div>
      <div className="fc-body">
        <div style={{ fontWeight: 800 }}>{app.name}</div>
        <div className="tiny muted" style={{ marginTop: 2 }}>{app.tagline || app.developer}</div>
        <div className="fc-row">
          <span className="tiny muted">
            <Stars rating={app.rating || 0} /> {app.rating ? Number(app.rating).toFixed(1) : 'New'} · {fmtCount(app.downloads)}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onGet(app) }}>
            Get
          </button>
        </div>
      </div>
    </div>
  )
}

/* stylized screenshot (mock) or uploaded image */
export function Shot({ shot }) {
  if (shot.type === 'image' && shot.path) {
    return (
      <div className="shot">
        <img src={`/api/${shot.path}`} alt={shot.title || ''} loading="lazy" />
      </div>
    )
  }
  const [a, b] = shot.palette || ['#6366f1', '#8b5cf6']
  return (
    <div className="shot" style={{ background: `linear-gradient(160deg, ${a}, ${b})` }}>
      <div className="shot-emoji">{shot.emoji || '✨'}</div>
      <div style={{ padding: '0 4px' }}>{shot.title}</div>
      <div className="shot-lines"><i /><i style={{ width: '55%' }} /><i style={{ width: '80%' }} /></div>
    </div>
  )
}

export function ProgressBar({ pct }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.max(2, Math.min(100, pct || 0))}%` }} />
    </div>
  )
}

export function KV({ rows }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{k}</dt><dd>{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

export { fmtCount, fmtDate, fmtSize }

/* copy-to-clipboard button */
export function CopyBtn({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text) } catch { /* noop */ }
        setDone(true)
        setTimeout(() => setDone(false), 1600)
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  )
}
