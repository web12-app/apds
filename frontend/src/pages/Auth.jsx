import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useApp } from '../store.jsx'

export default function Auth({ mode: initial }) {
  const [mode, setMode] = useState(initial)
  const [form, setForm] = useState({
    identifier: '', username: '', email: '', password: '', confirm: '',
    beDeveloper: false, devName: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { setUser, toast } = useApp()
  const navigate = useNavigate()
  const loc = useLocation()

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      let data
      if (mode === 'signup') {
        if (form.password !== form.confirm) throw { detail: 'Passwords do not match.' }
        data = await api('/api/auth/signup', {
          method: 'POST',
          body: {
            username: form.username.trim(),
            email: form.email.trim(),
            password: form.password,
            confirm_password: form.confirm,
            ...(form.beDeveloper && form.devName.trim()
              ? { developer: { name: form.devName.trim() } }
              : {}),
          },
        })
        toast('Welcome to APDS 🎉')
      } else {
        data = await api('/api/auth/login', {
          method: 'POST',
          body: { identifier: form.identifier.trim(), password: form.password },
        })
        toast(`Welcome back, ${data.user.username}!`)
      }
      setUser(data.user)
      navigate(loc.state?.from || '/home', { replace: true })
    } catch (err) {
      setError(err.detail || 'Unable to complete this request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-logo">
        <span className="logo-mark" style={{ width: 58, height: 58, borderRadius: 18, fontSize: 26 }}>A</span>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>APDS</div>
        <div className="muted tiny">Discover. Download. Create.</div>
      </div>

      <div className="tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>Login</button>
        <button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError('') }}>Sign Up</button>
      </div>

      <form className="card" onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}

        {mode === 'login' ? (
          <>
            <div className="field">
              <label className="label">Email or username</label>
              <input value={form.identifier} onChange={set('identifier')} autoComplete="username" required />
            </div>
            <div className="field">
              <label className="label">Password</label>
              <input type="password" value={form.password} onChange={set('password')} autoComplete="current-password" required />
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label className="label">Username</label>
              <input value={form.username} onChange={set('username')} autoComplete="username"
                placeholder="3–24 letters, numbers, underscores" required />
            </div>
            <div className="field">
              <label className="label">Email</label>
              <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
            </div>
            <div className="field">
              <label className="label">Password</label>
              <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password"
                placeholder="8+ characters, letters and numbers" required />
              <div className="form-hint">Hashed with bcrypt — we never store plain passwords.</div>
            </div>
            <div className="field">
              <label className="label">Confirm password</label>
              <input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
            </div>
            <label className="checkrow">
              <input type="checkbox" checked={form.beDeveloper}
                onChange={(e) => setForm(f => ({ ...f, beDeveloper: e.target.checked }))} />
              I want to publish apps on APDS
            </label>
            {form.beDeveloper && (
              <div className="field">
                <label className="label">Developer / studio name</label>
                <input value={form.devName} onChange={set('devName')} placeholder="e.g. Northlight Labs" />
              </div>
            )}
          </>
        )}

        <button className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create account'}
        </button>
      </form>

      <div className="center muted tiny" style={{ marginTop: 16 }}>
        {mode === 'login' ? (
          <>New here? <a href="#signup" onClick={(e) => { e.preventDefault(); setMode('signup') }}>Create an account</a></>
        ) : (
          <>Already have an account? <a href="#login" onClick={(e) => { e.preventDefault(); setMode('login') }}>Login</a></>
        )}
        <div style={{ marginTop: 10 }}>
          <Link to="/" className="muted">← Back to welcome</Link>
        </div>
      </div>
    </div>
  )
}
