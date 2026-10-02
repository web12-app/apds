import React, { useEffect, useState } from 'react'
import { api } from '../../api.js'
import { useApp } from '../../store.jsx'
import { CopyBtn, Empty, ErrorBox, Modal } from '../../components/UI.jsx'
import DevNav from './DevNav.jsx'

const ALL_SCOPES = [
  ['apps.read', 'Read app listings'],
  ['apps.write', 'Create & edit apps'],
  ['uploads.create', 'Create upload sessions'],
  ['releases.write', 'Manage & publish releases'],
  ['account.read', 'Read account info'],
  ['account.write', 'Modify account, manage keys'],
]

export default function ApiKeys() {
  const [keys, setKeys] = useState(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState(null) // {name, key}
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState(['apps.read'])
  const { toast, refreshUser } = useApp()

  const load = () => api('/api/keys').then(r => setKeys(r.items)).catch(setError)
  useEffect(() => { load() }, [])

  const create = async () => {
    setError('')
    try {
      const r = await api('/api/keys', { method: 'POST', body: { name: name.trim(), scopes } })
      setCreating(false)
      setNewKey(r)
      setName('')
      refreshUser()
      load()
    } catch (e) { setError(e.detail) }
  }

  const revoke = async (id) => {
    if (!window.confirm('Revoke this API key? Clients using it will stop working immediately.')) return
    try {
      await api(`/api/keys/${id}`, { method: 'DELETE' })
      toast('Key revoked')
      load()
    } catch (e) { toast(e.detail, 'error') }
  }

  const rotate = async (id) => {
    if (!window.confirm('Rotate this key? The old key stops working immediately; a new one is issued.')) return
    try {
      const r = await api(`/api/keys/${id}/rotate`, { method: 'POST' })
      setNewKey(r)
      load()
    } catch (e) { toast(e.detail, 'error') }
  }

  return (
    <main className="page">
      <div className="row between" style={{ margin: '8px 2px 4px' }}>
        <h1 style={{ margin: 0, fontSize: 21, letterSpacing: '-0.02em' }}>API keys</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>＋ New key</button>
      </div>
      <DevNav />

      <div className="card tiny muted" style={{ marginBottom: 14, lineHeight: 1.65 }}>
        Use keys with <code>Authorization: Bearer &lt;key&gt;</code> or <code>X-API-Key</code> on any API client.
        Keys are scoped, revocable, and shown only once — only their hash is stored.
      </div>

      {error && <ErrorBox error={error} />}

      {!keys ? (
        <div className="skeleton" style={{ height: 160, borderRadius: 18 }} />
      ) : keys.length ? (
        <div className="stack">
          {keys.map(k => (
            <div key={k.id} className={`card ${k.revoked_at ? '' : ''}`} style={{ opacity: k.revoked_at ? 0.55 : 1 }}>
              <div className="row between">
                <div>
                  <div style={{ fontWeight: 800 }}>{k.name} {k.revoked_at && <span className="badge failed">revoked</span>}</div>
                  <div className="tiny muted" style={{ marginTop: 3, fontFamily: 'monospace' }}>{k.prefix}…</div>
                </div>
                {!k.revoked_at && (
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => rotate(k.id)}>Rotate</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }} onClick={() => revoke(k.id)}>Revoke</button>
                  </div>
                )}
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {k.scopes.map(s => <span key={s} className="tag">{s}</span>)}
              </div>
              <div className="tiny muted" style={{ marginTop: 10 }}>
                Created {new Date(k.created_at + 'Z').toLocaleDateString()}
                {k.last_used_at ? ` · last used ${new Date(k.last_used_at + 'Z').toLocaleDateString()}` : ' · never used'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty emoji="🔑" title="No API keys" hint="Create a scoped key to use the APDS API from your tools."
          action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Create your first key</button>} />
      )}

      {creating && (
        <Modal title="New API key" onClose={() => setCreating(false)}>
          <div className="field">
            <label className="label">Key name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CI pipeline" />
          </div>
          <div className="field">
            <label className="label">Scopes (least privilege)</label>
            {ALL_SCOPES.map(([id, label]) => (
              <label key={id} className="checkrow">
                <input type="checkbox" checked={scopes.includes(id)}
                  onChange={(e) => setScopes(s => e.target.checked ? [...s, id] : s.filter(x => x !== id))} />
                <span><code style={{ fontSize: 12 }}>{id}</code> — {label}</span>
              </label>
            ))}
          </div>
          <button className="btn btn-primary btn-block" onClick={create} disabled={!name.trim() || !scopes.length}>
            Create key
          </button>
        </Modal>
      )}

      {newKey && (
        <Modal title="Save your key" onClose={() => setNewKey(null)}>
          <p className="tiny muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
            This is the only time the full key is shown. Copy it somewhere safe.
          </p>
          <div className="card" style={{ background: 'var(--bg-elev)', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 13 }}>
            {newKey.key}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <CopyBtn text={newKey.key} label="Copy key" />
            <button className="btn btn-primary btn-sm" onClick={() => setNewKey(null)}>Done</button>
          </div>
        </Modal>
      )}
    </main>
  )
}
