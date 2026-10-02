// APDS frontend API layer.
// - Every call carries the public X-App-Key (client identifier, fetched from /api/meta).
// - Identity rides on the httpOnly session cookie.
// - XHR helpers give upload/download progress, speed, ETA, cancel & retry.

let APP_KEY = null
let META = null

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || 'Request failed')
    this.status = status
    this.detail = detail
  }
}

export async function bootstrap() {
  const r = await fetch('/api/meta')
  META = await r.json()
  APP_KEY = META.app_key
  return META
}

export function getMeta() {
  return META
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Key': APP_KEY,
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data = {}
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, data.detail || 'Unable to complete this request.')
  return data
}

export async function sha256Hex(file) {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ---- streaming upload through the temporary public tunnel ----
export function uploadWithProgress({ url, token, file, onProgress, registerXhr }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    if (registerXhr) registerXhr(xhr)
    const started = performance.now()
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return
      const elapsed = (performance.now() - started) / 1000
      const speed = e.loaded / Math.max(elapsed, 0.05)
      const eta = (e.total - e.loaded) / Math.max(speed, 1)
      onProgress({
        loaded: e.loaded,
        total: e.total,
        pct: Math.round((e.loaded / e.total) * 100),
        speed,
        eta,
      })
    }
    xhr.onload = () => {
      let data = {}
      try { data = JSON.parse(xhr.responseText) } catch { /* noop */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new ApiError(xhr.status, data.detail || 'Upload failed.'))
    }
    xhr.onerror = () => reject(new ApiError(0, 'Network error during upload.'))
    xhr.onabort = () => reject(Object.assign(new Error('canceled'), { canceled: true }))
    xhr.open('PUT', url)
    xhr.setRequestHeader('X-App-Key', APP_KEY)
    xhr.setRequestHeader('X-Upload-Token', token)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.send(file)
  })
}

// ---- authorized download with progress ----
export function downloadWithProgress({ url, filename, onProgress, registerXhr }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    if (registerXhr) registerXhr(xhr)
    const started = performance.now()
    xhr.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return
      const elapsed = (performance.now() - started) / 1000
      const speed = e.loaded / Math.max(elapsed, 0.05)
      const eta = (e.total - e.loaded) / Math.max(speed, 1)
      onProgress({ loaded: e.loaded, total: e.total, pct: Math.round((e.loaded / e.total) * 100), speed, eta })
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const blob = new Blob([xhr.response])
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30000)
        resolve({ size: blob.size, demo: xhr.getResponseHeader('X-Demo-Package') === 'true' })
      } else {
        let detail = 'Download failed.'
        try { detail = JSON.parse(xhr.responseText).detail || detail } catch { /* noop */ }
        reject(new ApiError(xhr.status, detail))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Network error during download.'))
    xhr.onabort = () => reject(Object.assign(new Error('canceled'), { canceled: true }))
    xhr.responseType = 'arraybuffer'
    xhr.open('GET', url)
    xhr.setRequestHeader('X-App-Key', APP_KEY)
    xhr.send()
  })
}

// ---- formatting helpers ----
export function fmtCount(n) {
  n = Number(n || 0)
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K'
  return String(n)
}

export function fmtSize(kb) {
  kb = Number(kb || 0)
  if (kb >= 1024 * 1024) return (kb / 1024 / 1024).toFixed(1) + ' GB'
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB'
  return kb + ' KB'
}

export function fmtSpeed(bps) {
  if (bps >= 1048576) return (bps / 1048576).toFixed(1) + ' MB/s'
  if (bps >= 1024) return (bps / 1024).toFixed(0) + ' KB/s'
  return Math.max(1, bps | 0) + ' B/s'
}

export function fmtEta(sec) {
  if (!isFinite(sec) || sec < 0) return '—'
  if (sec < 60) return Math.ceil(sec) + 's'
  if (sec < 3600) return Math.floor(sec / 60) + 'm ' + Math.ceil(sec % 60) + 's'
  return Math.floor(sec / 3600) + 'h ' + Math.ceil((sec % 3600) / 60) + 'm'
}

export function fmtDate(s) {
  if (!s) return '—'
  try {
    return new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  } catch {
    return s
  }
}
