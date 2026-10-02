import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fmtCount, fmtDate, fmtSize } from '../../api.js'
import { CopyBtn, ErrorBox, KV } from '../../components/UI.jsx'
import DevNav from './DevNav.jsx'

const STEPS = [
  ['draft', 'Draft created'],
  ['uploaded', 'Package uploaded & checksum verified'],
  ['processing', 'Pipeline validation'],
  ['published', 'Published to the store'],
]

export default function ReleaseDetails() {
  const { slug, version } = useParams()
  const [rel, setRel] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/api/releases/${slug}--${version}`).then(setRel).catch(setError)
  }, [slug, version])

  if (error) return <main className="page"><ErrorBox error={error} /></main>
  if (!rel) return <main className="page"><div className="skeleton" style={{ height: 240, borderRadius: 18 }} /></main>

  const currentStep = STEPS.findIndex(([id]) => id === rel.status)
  const failed = rel.status === 'failed'

  return (
    <main className="page">
      <div className="row between" style={{ margin: '8px 2px 4px' }}>
        <h1 style={{ margin: 0, fontSize: 21, letterSpacing: '-0.02em' }}>{rel.app_name} · v{rel.version}</h1>
        <span className={`badge ${rel.status}`}>{rel.status}</span>
      </div>
      <DevNav />

      {/* pipeline */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>Release pipeline</div>
        {STEPS.map(([id, label], i) => (
          <div key={id} className="row" style={{ marginBottom: 10, opacity: i <= currentStep || failed ? 1 : 0.45 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 9, display: 'grid', placeItems: 'center',
              fontSize: 13, fontWeight: 800, color: '#fff',
              background: i < currentStep || (!failed && i <= currentStep)
                ? 'linear-gradient(135deg,#10b981,#059669)'
                : i === currentStep && !failed
                  ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                  : 'var(--bg-elev)',
              color: i <= currentStep && !failed ? undefined : 'var(--text-3)',
            }}>
              {i < currentStep ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
          </div>
        ))}
        {failed && <div className="form-error" style={{ marginBottom: 0 }}>Processing failed — retry the upload.</div>}
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 12 }}>Details</div>
        <KV rows={[
          ['App', <Link to={`/app/${slug}`} style={{ color: 'var(--brand1)' }}>{rel.app_name}</Link>],
          ['Version', `v${rel.version}`],
          ['Status', rel.status],
          ['Package', rel.filename || '—'],
          ['Size', rel.size_kb ? fmtSize(rel.size_kb) : '—'],
          ['Downloads', fmtCount(rel.downloads)],
          ['Created', fmtDate(rel.created_at)],
          ['Published', fmtDate(rel.published_at)],
        ]} />
        {rel.sha256 && (
          <>
            <div className="divider" />
            <div className="row between">
              <div style={{ minWidth: 0 }}>
                <div className="tiny" style={{ fontWeight: 700 }}>SHA-256 checksum</div>
                <div className="tiny muted" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{rel.sha256}</div>
              </div>
              <CopyBtn text={rel.sha256} />
            </div>
          </>
        )}
        <div className="divider" />
        <div className="tiny" style={{ fontWeight: 700, marginBottom: 4 }}>Release notes</div>
        <p className="tiny muted" style={{ margin: 0, lineHeight: 1.6 }}>{rel.notes || '—'}</p>
      </div>
    </main>
  )
}
