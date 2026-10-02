import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, fmtDate } from '../api.js'
import { useApp } from '../store.jsx'
import { ErrorBox, Modal } from '../components/UI.jsx'

export default function Account() {
  const { user, refreshUser, logout, toast } = useApp()
  const [edit, setEdit] = useState(false)
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const save = async () => {
    setError('')
    try {
      await api('/api/account', { method: 'PATCH', body: { username, email } })
      await refreshUser()
      toast('Account updated ✅')
      setEdit(false)
    } catch (e) { setError(e.detail) }
  }

  const doDelete = async () => {
    setError('')
    try {
      await api('/api/account', { method: 'DELETE', body: { password } })
      toast('Account deleted')
      navigate('/')
      window.location.reload()
    } catch (e) { setError(e.detail) }
  }

  if (!user) return null
  const dev = user.developer

  return (
    <main className="page">
      <div className="card center" style={{ padding: '26px 18px' }}>
        <div className="icon-badge lg" style={{ margin: '0 auto 12px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', fontSize: 34 }}>
          {user.username.slice(0, 1).toUpperCase()}
        </div>
        <div style={{ fontWeight: 800, fontSize: 19 }}>{user.username}</div>
        <div className="muted tiny">{user.email}</div>
        <div className="tiny muted" style={{ marginTop: 4 }}>Member since {fmtDate(user.created_at)}</div>

        {!edit ? (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setEdit(true)}>Edit profile</button>
        ) : (
          <div style={{ textAlign: 'left', marginTop: 16 }}>
            {error && <div className="form-error">{error}</div>}
            <div className="field">
              <label className="label">Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="row">
              <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* developer card */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="row between">
          <div>
            <div style={{ fontWeight: 800 }}>🧑‍💻 Developer</div>
            <div className="tiny muted" style={{ marginTop: 3 }}>
              {dev ? `${dev.name} · @${dev.slug}` : 'Publish your own apps on APDS'}
            </div>
          </div>
          <Link to="/dev" className="btn btn-ghost btn-sm">{dev ? 'Open' : 'Become one'}</Link>
        </div>
      </div>

      {/* links */}
      <div className="card" style={{ marginTop: 14, padding: 6 }}>
        {[
          ['⚙️', 'Settings', '/settings'],
          ['🔑', 'API keys', '/dev/keys'],
          ['🔔', 'Notifications', '/notifications'],
          ['🔒', 'Privacy policy', '/privacy'],
          ['📜', 'Terms of service', '/terms'],
          ['❓', 'Help & support', '/help'],
        ].map(([icon, label, to]) => (
          <Link key={to} to={to} className="app-row">
            <span style={{ fontSize: 20 }}>{icon}</span>
            <div className="meta"><div className="name">{label}</div></div>
            <span className="muted">›</span>
          </Link>
        ))}
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        <button className="btn btn-ghost btn-block" onClick={async () => { await logout(); navigate('/') }}>
          Log out
        </button>
        <button className="btn btn-danger btn-block" onClick={() => setConfirmDelete(true)}>Delete account</button>
      </div>

      {confirmDelete && (
        <Modal title="Delete account" onClose={() => setConfirmDelete(false)}>
          {error && <div className="form-error">{error}</div>}
          <p className="tiny muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
            This permanently deletes your account, sessions and API keys.
            Published catalog data is retained on the platform. This cannot be undone.
          </p>
          <div className="field">
            <label className="label">Confirm your password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={doDelete}>Delete forever</button>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </main>
  )
}
