import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { bootstrap, api, downloadWithProgress } from './api.js'

const Ctx = createContext(null)

export function useApp() {
  return useContext(Ctx)
}

const THEME_KEY = 'apds_theme'

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState(null)
  const [downloads, setDownloads] = useState([])   // active downloads (live progress)
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('apds_dl_history') || '[]') } catch { return [] }
  })
  const [toasts, setToasts] = useState([])
  const [theme, setThemeState] = useState(() => localStorage.getItem(THEME_KEY) || 'system')
  const xhrRefs = useRef({})

  // ---- theme ----
  const applyTheme = useCallback((mode) => {
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.documentElement.dataset.theme = mode === 'system' ? system : mode
  }, [])
  useEffect(() => { applyTheme(theme) }, [theme, applyTheme])
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = () => theme === 'system' && applyTheme('system')
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [theme, applyTheme])
  const setTheme = (mode) => { localStorage.setItem(THEME_KEY, mode); setThemeState(mode) }

  // ---- boot ----
  useEffect(() => {
    ;(async () => {
      try {
        await bootstrap()
        const { user } = await api('/api/account').catch(() => ({ user: null }))
        setUser(user)
      } catch {
        /* API down — app still renders */
      } finally {
        setReady(true)
      }
    })()
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await api('/api/account')
      setUser(user)
      return user
    } catch {
      setUser(null)
      return null
    }
  }, [])

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }, [])

  // ---- toasts ----
  const toast = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800)
  }, [])

  // ---- downloads ----
  const pushHistory = useCallback((entry) => {
    setHistory(h => {
      const next = [entry, ...h.filter(x => !(x.slug === entry.slug && x.version === entry.version))].slice(0, 50)
      localStorage.setItem('apds_dl_history', JSON.stringify(next))
      return next
    })
  }, [])

  const startDownload = useCallback((app, version) => {
    const id = Math.random().toString(36).slice(2)
    const entry = {
      id,
      slug: app.slug,
      name: app.name,
      icon: app.icon,
      version: version.version,
      rid: `${app.slug}--${version.version}`,
      filename: version.filename || `${app.slug}-${version.version}.zip`,
      status: 'downloading',
      pct: 0, loaded: 0, total: (version.size_kb || 0) * 1024,
    }
    setDownloads(d => [...d, entry])
    toast(`Downloading ${app.name} ${version.version}…`)

    downloadWithProgress({
      url: `/api/releases/${entry.rid}/download`,
      filename: entry.filename,
      registerXhr: (xhr) => { xhrRefs.current[id] = xhr },
      onProgress: (p) => {
        setDownloads(d => d.map(x => x.id === id ? { ...x, ...p, status: 'downloading' } : x))
      },
    })
      .then((res) => {
        setDownloads(d => d.map(x => x.id === id ? { ...x, status: 'done', pct: 100, demo: res.demo } : x))
        pushHistory({ slug: entry.slug, name: entry.name, icon: entry.icon, version: entry.version, rid: entry.rid, at: Date.now() })
        toast(`${app.name} ${entry.version} downloaded ✅`)
        refreshUser() // installed list updates
      })
      .catch((err) => {
        if (err && err.canceled) {
          setDownloads(d => d.map(x => x.id === id ? { ...x, status: 'canceled' } : x))
        } else {
          setDownloads(d => d.map(x => x.id === id ? { ...x, status: 'failed', error: err.detail } : x))
          toast(err.detail || 'Download failed', 'error')
        }
      })
      .finally(() => { delete xhrRefs.current[id] })
  }, [pushHistory, refreshUser, toast])

  const cancelDownload = useCallback((id) => {
    const xhr = xhrRefs.current[id]
    if (xhr) xhr.abort()
  }, [])

  const clearFinished = useCallback(() => {
    setDownloads(d => d.filter(x => x.status === 'downloading'))
  }, [])

  const value = {
    ready, user, setUser, refreshUser, logout,
    theme, setTheme,
    toast, toasts,
    downloads, startDownload, cancelDownload, clearFinished, history,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
