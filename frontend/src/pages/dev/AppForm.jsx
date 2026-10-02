import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import { useApp } from '../../store.jsx'
import { ErrorBox, Icon } from '../../components/UI.jsx'
import DevNav from './DevNav.jsx'

const EMOJIS = ['📦', '🎮', '🎵', '📝', '🔐', '💬', '🚀', '🧩', '⚡', '🎓', '🧰', '🗣️', '⏱️', '📄', '🏎️', '🎧']
const GRADIENTS = [
  ['#6366f1', '#8b5cf6'], ['#f97316', '#ef4444'], ['#06b6d4', '#3b82f6'],
  ['#10b981', '#84cc16'], ['#ec4899', '#f43f5e'], ['#8b5cf6', '#d946ef'],
  ['#f59e0b', '#f97316'], ['#334155', '#0ea5e9'],
]
const AGES = ['Everyone', 'Everyone 10+', 'Teen', '13+', 'Mature 17+']

function toB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export default function AppForm({ edit = false }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { toast, user } = useApp()
  const [cats, setCats] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [iconFile, setIconFile] = useState(null)
  const [shotFiles, setShotFiles] = useState([])
  const [form, setForm] = useState({
    name: '', package_id: '', description: '', category: '', tagline: '',
    tags: '', website: '', privacy_policy: '', age_rating: 'Everyone',
    icon: { type: 'gradient', emoji: '📦', gradient: GRADIENTS[0] },
  })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  useEffect(() => { api('/api/categories').then(setCats).catch(() => {}) }, [])

  useEffect(() => {
    if (!edit || !slug) return
    api(`/api/apps/${slug}`)
      .then((a) => setForm({
        name: a.name, package_id: a.package_id || '', description: a.description,
        category: a.category, tagline: a.tagline || '', tags: (a.tags || []).join(', '),
        website: a.website || '', privacy_policy: a.privacy_policy || '',
        age_rating: a.age_rating || 'Everyone', icon: a.icon,
      }))
      .catch((e) => setError(e))
  }, [edit, slug])

  if (!user?.developer) {
    return <main className="page"><ErrorBox error={{ detail: 'Become a developer first.' }} /><Link to="/dev" className="btn btn-primary">Create developer profile</Link></main>
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const body = {
        name: form.name.trim(),
        package_id: form.package_id.trim(),
        description: form.description.trim(),
        category: form.category,
        tagline: form.tagline.trim(),
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        website: form.website.trim(),
        privacy_policy: form.privacy_policy.trim(),
        age_rating: form.age_rating,
        icon: form.icon,
      }
      let appSlug
      if (edit) {
        const updated = await api(`/api/apps/${slug}`, { method: 'PATCH', body })
        appSlug = updated.slug
      } else {
        const created = await api('/api/apps', { method: 'POST', body })
        appSlug = created.slug
      }

      if (iconFile) {
        await api(`/api/apps/${appSlug}/assets`, {
          method: 'POST',
          body: { kind: 'icon', filename: iconFile.name, data_b64: await toB64(iconFile) },
        })
      }
      for (const f of shotFiles.slice(0, 5)) {
        await api(`/api/apps/${appSlug}/assets`, {
          method: 'POST',
          body: { kind: 'screenshot', filename: f.name, data_b64: await toB64(f) },
        })
      }

      toast(edit ? 'App updated ✅' : 'App created 🎉 Now upload a release!')
      navigate(`/dev/apps/${appSlug}/releases/new`)
    } catch (e) {
      setError(e.detail || 'Unable to save the app.')
    } finally { setBusy(false) }
  }

  return (
    <main className="page">
      <h1 style={{ margin: '8px 2px 14px', fontSize: 22, letterSpacing: '-0.02em' }}>
        {edit ? 'Edit app' : 'Create app'}
      </h1>
      <DevNav />

      <form className="card" onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}

        <div className="row" style={{ marginBottom: 16 }}>
          <Icon icon={form.icon} size="lg" />
          <div className="tiny muted" style={{ lineHeight: 1.6 }}>
            App icon preview.<br />Pick an emoji + gradient, or upload an image below.
          </div>
        </div>

        <div className="field">
          <label className="label">App name *</label>
          <input value={form.name} onChange={set('name')} required maxLength={64} />
        </div>
        <div className="field">
          <label className="label">Package ID *</label>
          <input value={form.package_id} onChange={set('package_id')} placeholder="com.yourstudio.yourapp"
            pattern="[a-z0-9_]+(\.[a-z0-9_]+){1,4}" required disabled={edit} />
          {edit && <div className="form-hint">Package ID is immutable after creation.</div>}
        </div>
        <div className="field">
          <label className="label">Tagline</label>
          <input value={form.tagline} onChange={set('tagline')} maxLength={120} placeholder="One line that sells it" />
        </div>
        <div className="field">
          <label className="label">Description *</label>
          <textarea value={form.description} onChange={set('description')} required
            placeholder="What does your app do? What makes it great?" />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="label">Category *</label>
            <select value={form.category} onChange={set('category')} required>
              <option value="">Select…</option>
              {cats.map(c => <option key={c.slug} value={c.slug}>{c.emoji} {c.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="label">Age rating</label>
            <select value={form.age_rating} onChange={set('age_rating')}>
              {AGES.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="label">Tags (comma separated, max 8)</label>
          <input value={form.tags} onChange={set('tags')} placeholder="notes, markdown, sync" />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="label">Website</label>
            <input value={form.website} onChange={set('website')} placeholder="https://…" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="label">Privacy policy</label>
            <input value={form.privacy_policy} onChange={set('privacy_policy')} placeholder="https://…/privacy" />
          </div>
        </div>

        <div className="field">
          <label className="label">Icon style</label>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {EMOJIS.map(e => (
              <button type="button" key={e} className="iconbtn"
                style={{ background: form.icon.emoji === e ? 'var(--bg-elev)' : undefined, fontSize: 19 }}
                onClick={() => setForm(f => ({ ...f, icon: { ...f.icon, emoji: e } }))}>{e}</button>
            ))}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            {GRADIENTS.map(g => (
              <button type="button" key={String(g)} onClick={() => setForm(f => ({ ...f, icon: { ...f.icon, gradient: g } }))}
                style={{
                  width: 40, height: 40, borderRadius: 12, border: form.icon.gradient[1] === g[1] ? '3px solid var(--brand1)' : '3px solid transparent',
                  background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`, cursor: 'pointer',
                }} aria-label={`Gradient ${g}`} />
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label">…or upload an icon image (PNG/JPG/WEBP ≤ 2 MB)</label>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setIconFile(e.target.files?.[0] || null)} />
        </div>
        <div className="field">
          <label className="label">Screenshots (up to 5, ≤ 2 MB each)</label>
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple
            onChange={(e) => setShotFiles(Array.from(e.target.files || []).slice(0, 5))} />
          {shotFiles.length > 0 && <div className="form-hint">{shotFiles.length} screenshot(s) queued</div>}
        </div>

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Saving…' : edit ? 'Save changes' : 'Create app'}
        </button>
      </form>
    </main>
  )
}
