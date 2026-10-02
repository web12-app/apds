import React from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, Link } from 'react-router-dom'
import { useApp } from './store.jsx'

import Welcome from './pages/Welcome.jsx'
import Auth from './pages/Auth.jsx'
import Home from './pages/Home.jsx'
import Search from './pages/Search.jsx'
import Categories, { Category } from './pages/Categories.jsx'
import AppDetails from './pages/AppDetails.jsx'
import Library from './pages/Library.jsx'
import Downloads from './pages/Downloads.jsx'
import Notifications from './pages/Notifications.jsx'
import Account from './pages/Account.jsx'
import Settings from './pages/Settings.jsx'
import StaticPage from './pages/Static.jsx'

import DevDashboard from './pages/dev/Dashboard.jsx'
import MyApps from './pages/dev/MyApps.jsx'
import AppForm from './pages/dev/AppForm.jsx'
import ReleaseForm from './pages/dev/ReleaseForm.jsx'
import ReleaseDetails from './pages/dev/ReleaseDetails.jsx'
import Stats from './pages/dev/Stats.jsx'
import ApiKeys from './pages/dev/ApiKeys.jsx'

function RequireAuth({ children }) {
  const { user, ready } = useApp()
  const loc = useLocation()
  if (!ready) return <div className="page" style={{ padding: 40 }}><div className="skeleton" style={{ height: 200 }} /></div>
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  return children
}

function TopBar() {
  const { user } = useApp()
  const unread = user?.unread_notifications || 0
  return (
    <header className="topbar">
      <Link to="/home" className="logo" aria-label="APDS home">
        <span className="logo-mark">A</span>
        <span>APDS</span>
      </Link>
      <span className="grow" />
      <Link to="/search" className="iconbtn" aria-label="Search">🔍</Link>
      <Link to="/notifications" className="iconbtn" aria-label="Notifications">
        🔔{unread > 0 && <span className="dot" />}
      </Link>
      <Link to="/account" className="iconbtn" aria-label="Account">
        {user ? '👤' : '🔐'}
      </Link>
    </header>
  )
}

function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/home" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="ni">🏠</span>Home
      </NavLink>
      <NavLink to="/search" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="ni">🔍</span>Search
      </NavLink>
      <NavLink to="/library" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="ni">📚</span>Library
      </NavLink>
      <NavLink to="/dev" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="ni">🧑‍💻</span>Developer
      </NavLink>
      <NavLink to="/account" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="ni">👤</span>Account
      </NavLink>
    </nav>
  )
}

function Toasts() {
  const { toasts } = useApp()
  if (!toasts.length) return null
  return (
    <div className="toast-wrap">
      {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
    </div>
  )
}

export default function App() {
  const loc = useLocation()
  const bare = loc.pathname === '/' || loc.pathname === '/login' || loc.pathname === '/signup'
  return (
    <div className="app">
      {!bare && <TopBar />}
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/signup" element={<Auth mode="signup" />} />

        <Route path="/home" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/category/:slug" element={<Category />} />
        <Route path="/app/:slug" element={<AppDetails />} />
        <Route path="/downloads" element={<Downloads />} />
        <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />

        <Route path="/library" element={<RequireAuth><Library /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/privacy" element={<StaticPage page="privacy" />} />
        <Route path="/terms" element={<StaticPage page="terms" />} />
        <Route path="/help" element={<StaticPage page="help" />} />

        <Route path="/dev" element={<RequireAuth><DevDashboard /></RequireAuth>} />
        <Route path="/dev/apps" element={<RequireAuth><MyApps /></RequireAuth>} />
        <Route path="/dev/apps/new" element={<RequireAuth><AppForm /></RequireAuth>} />
        <Route path="/dev/apps/:slug/edit" element={<RequireAuth><AppForm edit /></RequireAuth>} />
        <Route path="/dev/apps/:slug/releases/new" element={<RequireAuth><ReleaseForm /></RequireAuth>} />
        <Route path="/dev/releases/:slug/:version" element={<RequireAuth><ReleaseDetails /></RequireAuth>} />
        <Route path="/dev/stats" element={<RequireAuth><Stats /></RequireAuth>} />
        <Route path="/dev/keys" element={<RequireAuth><ApiKeys /></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!bare && <BottomNav />}
      <Toasts />
    </div>
  )
}
