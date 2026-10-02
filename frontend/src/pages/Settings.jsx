import React from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../store.jsx'

const THEMES = [
  { id: 'light', label: '☀️ Light' },
  { id: 'dark', label: '🌙 Dark' },
  { id: 'system', label: '🖥️ System' },
]

export default function Settings() {
  const { theme, setTheme, toast } = useApp()

  return (
    <main className="page">
      <h1 style={{ margin: '8px 2px 14px', fontSize: 24, letterSpacing: '-0.02em' }}>Settings</h1>

      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Appearance</div>
        <div className="row" style={{ gap: 8 }}>
          {THEMES.map(t => (
            <button
              key={t.id}
              className="btn btn-sm"
              style={{
                flex: 1,
                background: theme === t.id ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'var(--bg-elev)',
                color: theme === t.id ? '#fff' : 'var(--text)',
              }}
              onClick={() => setTheme(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Data & privacy</div>
        <p className="tiny muted" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
          Downloads history is stored locally on this device. Clearing it does not affect your account.
        </p>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            localStorage.removeItem('apds_dl_history')
            toast('Local download history cleared')
            setTimeout(() => window.location.reload(), 600)
          }}
        >
          Clear local data
        </button>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>About</div>
        <div className="kv">
          <dt>Platform</dt><dd>APDS</dd>
          <dt>Version</dt><dd>1.0.0</dd>
          <dt>Tagline</dt><dd>Discover. Download. Create.</dd>
        </div>
        <div className="row" style={{ gap: 14, marginTop: 14 }}>
          <Link to="/privacy" className="tiny" style={{ color: 'var(--brand1)', fontWeight: 700 }}>Privacy</Link>
          <Link to="/terms" className="tiny" style={{ color: 'var(--brand1)', fontWeight: 700 }}>Terms</Link>
          <Link to="/help" className="tiny" style={{ color: 'var(--brand1)', fontWeight: 700 }}>Help</Link>
        </div>
      </div>
    </main>
  )
}
