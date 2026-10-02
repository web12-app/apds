import React from 'react'
import { Link } from 'react-router-dom'
import { fmtEta, fmtSpeed } from '../api.js'
import { useApp } from '../store.jsx'
import { Empty, Icon, ProgressBar } from '../components/UI.jsx'

export default function Downloads() {
  const { downloads, cancelDownload, clearFinished, history } = useApp()
  const active = downloads.filter(d => d.status === 'downloading')
  const finished = downloads.filter(d => d.status !== 'downloading')

  return (
    <main className="page">
      <div className="row between" style={{ margin: '8px 2px 14px' }}>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: '-0.02em' }}>Downloads</h1>
        {(active.length === 0 && finished.length > 0) && (
          <button className="btn btn-ghost btn-sm" onClick={clearFinished}>Clear</button>
        )}
      </div>

      {downloads.length === 0 && history.length === 0 ? (
        <Empty
          emoji="⬇️" title="Nothing downloading"
          hint="Your downloads and their live progress will appear here."
          action={<Link to="/home" className="btn btn-primary">Find apps</Link>}
        />
      ) : (
        <>
          <div className="stack">
            {active.map(d => (
              <div key={d.id} className="card">
                <div className="row">
                  <Icon icon={d.icon} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{d.name}</div>
                    <div className="tiny muted">v{d.version} · {d.pct}% · {fmtSpeed(d.speed || 0)} · {fmtEta(d.eta)} left</div>
                  </div>
                  <button className="iconbtn" onClick={() => cancelDownload(d.id)} aria-label="Cancel">✕</button>
                </div>
                <div style={{ marginTop: 12 }}><ProgressBar pct={d.pct} /></div>
              </div>
            ))}
            {finished.map(d => (
              <div key={d.id} className="card row between" style={{ padding: '13px 16px' }}>
                <div className="row" style={{ minWidth: 0 }}>
                  <Icon icon={d.icon} size="sm" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{d.name} <span className="tiny muted">v{d.version}</span></div>
                    <div className="tiny muted">
                      {d.status === 'done' && (d.demo ? '✅ Demo package saved' : '✅ Downloaded')}
                      {d.status === 'failed' && `⚠️ ${d.error || 'Failed'}`}
                      {d.status === 'canceled' && '⛔ Canceled'}
                    </div>
                  </div>
                </div>
                {d.status === 'failed' && <span className="badge failed">retry from the app page</span>}
              </div>
            ))}
          </div>

          {history.length > 0 && (
            <>
              <div className="section-title"><h2>Recent</h2></div>
              <div className="card" style={{ padding: 6 }}>
                {history.map((h, i) => (
                  <Link key={i} to={`/app/${h.slug}`} className="app-row">
                    <Icon icon={h.icon} size="sm" />
                    <div className="meta">
                      <div className="name" style={{ fontSize: 14 }}>{h.name}</div>
                      <div className="sub tiny">v{h.version} · {new Date(h.at).toLocaleString()}</div>
                    </div>
                    <span className="muted">›</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </main>
  )
}
