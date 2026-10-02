import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fmtEta, fmtSpeed, sha256Hex, uploadWithProgress } from '../../api.js'
import { useApp } from '../../store.jsx'
import { ErrorBox, ProgressBar } from '../../components/UI.jsx'
import DevNav from './DevNav.jsx'

/* Stages: form → uploading → uploaded → publishing → published/failed */
export default function ReleaseForm() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { toast, user } = useApp()
  const [app, setApp] = useState(null)
  const [version, setVersion] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')

  const [stage, setStage] = useState('form') // form | uploading | uploaded | publishing | published | failed
  const [prog, setProg] = useState({ pct: 0, speed: 0, eta: 0 })
  const [uploadInfo, setUploadInfo] = useState(null)
  const [releaseId, setReleaseId] = useState(null)
  const [pollTimer, setPollTimer] = useState(null)
  const xhrRef = useRef(null)

  useEffect(() => {
    if (!user?.developer) return
    api(`/api/apps/${slug}`).then(setApp).catch(setError)
  }, [slug])

  useEffect(() => () => clearInterval(pollTimer), [pollTimer])

  if (!user?.developer) {
    return <main className="page"><ErrorBox error={{ detail: 'Become a developer first.' }} /><Link to="/dev" className="btn btn-primary">Create profile</Link></main>
  }

  const beginUpload = async () => {
    setError('')
    if (!file || !version.trim()) return setError('Pick a version and a package file.')
    setStage('uploading')
    try {
      const checksum = await sha256Hex(file)
      const rel = await api('/api/releases', {
        method: 'POST',
        body: {
          app: slug, version: version.trim(), notes: notes.trim(),
          filename: file.name, size: file.size, sha256: checksum,
        },
      })
      setReleaseId(rel.id)

      const session = await api('/api/upload-sessions', {
        method: 'POST', body: { release_id: rel.id },
      })

      await uploadWithProgress({
        url: session.upload_url,
        token: session.upload_token,
        file,
        registerXhr: (x) => { xhrRef.current = x },
        onProgress: setProg,
      })

      setUploadInfo({ size: file.size, sha256: checksum })
      setStage('uploaded')
      toast('Upload verified ✓ Checksum matches')
    } catch (e) {
      if (e.canceled) { setStage('form'); toast('Upload canceled') }
      else { setStage('failed'); setError(e.detail || 'Upload failed.') }
    }
  }

  const publish = async () => {
    setStage('publishing')
    setError('')
    try {
      const r = await api(`/api/releases/${releaseId}/publish`, { method: 'POST' })
      if (r.status === 'published') { setStage('published'); toast('Published 🎉') ; return }

      // processing — poll until the pipeline finishes
      const timer = setInterval(async () => {
        try {
          const st = await api(`/api/releases/${releaseId}`)
          if (st.status === 'published') {
            clearInterval(timer)
            setStage('published')
            toast('Published 🎉')
          } else if (st.status === 'failed') {
            clearInterval(timer)
            setStage('failed')
            setError('Processing failed — please retry the upload.')
          }
        } catch { /* transient */ }
      }, 3000)
      setPollTimer(timer)
    } catch (e) {
      setStage('uploaded')
      setError(e.detail)
    }
  }

  const retry = () => { setStage('form'); setProg({ pct: 0, speed: 0, eta: 0 }); setFile(null); setError('') }

  return (
    <main className="page">
      <div className="row between" style={{ margin: '8px 2px 4px' }}>
        <h1 style={{ margin: 0, fontSize: 21, letterSpacing: '-0.02em' }}>Upload release</h1>
        <Link to="/dev/apps" className="btn btn-ghost btn-sm">My apps</Link>
      </div>
      <DevNav />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="tiny muted">
          {app ? <><strong>{app.name}</strong> · {app.versions?.length || 0} existing version(s)</> : 'Loading…'}
        </div>
      </div>

      {error && <ErrorBox error={{ detail: error }} />}

      {stage === 'form' && (
        <div className="card">
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Version *</label>
              <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" required />
            </div>
          </div>
          <div className="field">
            <label className="label">Release notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Whats new in this version" />
          </div>
          <div className="field">
            <label className="label">Package file (.apk / .aab / .zip) *</label>
            <input type="file" accept=".apk,.aab,.zip" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file && (
              <div className="form-hint">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB — SHA-256 is computed in your browser before upload.
              </div>
            )}
          </div>
          <button className="btn btn-primary btn-block" onClick={beginUpload} disabled={!file || !version.trim()}>
            Create secure upload session & upload
          </button>
        </div>
      )}

      {stage === 'uploading' && (
        <div className="card center" style={{ padding: 26 }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>📤</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{file?.name}</div>
          <div className="muted tiny" style={{ margin: '6px 0 16px' }}>
            Streaming through a secure upload session — nothing is buffered on the server
          </div>
          <ProgressBar pct={prog.pct} />
          <div className="row between tiny muted" style={{ marginTop: 8 }}>
            <span>{prog.pct}%</span>
            <span>{fmtSpeed(prog.speed || 0)}</span>
            <span>{fmtEta(prog.eta || 0)} left</span>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={() => xhrRef.current?.abort()}>
            Cancel upload
          </button>
        </div>
      )}

      {stage === 'uploaded' && (
        <div className="card center" style={{ padding: 26 }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Upload complete & verified</div>
          <div className="tiny muted" style={{ margin: '8px 0 4px' }}>
            {uploadInfo && (uploadInfo.size / 1024).toFixed(1)} KB · SHA-256 {uploadInfo.sha256.slice(0, 16)}…
          </div>
          <div className="tiny muted" style={{ marginBottom: 16 }}>v{version} is validated and ready to go live.</div>
          <button className="btn btn-primary" onClick={publish}>🚀 Publish v{version}</button>
        </div>
      )}

      {stage === 'publishing' && (
        <div className="card center" style={{ padding: 26 }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>⏳</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Processing release…</div>
          <div className="tiny muted" style={{ margin: '8px 0 14px' }}>
            The package is being validated, tagged and published by the pipeline. This usually takes under a minute.
          </div>
          <ProgressBar pct={70} />
        </div>
      )}

      {stage === 'published' && (
        <div className="card center" style={{ padding: 26 }}>
          <div style={{ fontSize: 46, marginBottom: 8 }}>🎉</div>
          <div style={{ fontWeight: 800, fontSize: 19 }}>v{version} is live!</div>
          <div className="tiny muted" style={{ margin: '8px 0 16px' }}>
            Your release is published and available in the store.
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => navigate(`/app/${slug}`)}>View in store</button>
            <button className="btn btn-ghost" onClick={() => navigate('/dev/apps')}>My apps</button>
          </div>
        </div>
      )}

      {stage === 'failed' && (
        <div className="card center" style={{ padding: 26 }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Something went wrong</div>
          <div className="tiny muted" style={{ margin: '8px 0 16px' }}>{error || 'The upload or processing failed.'}</div>
          <button className="btn btn-primary" onClick={retry}>Try again</button>
        </div>
      )}
    </main>
  )
}
