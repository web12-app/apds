import React, { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../store.jsx'

const FLOATERS = [
  { emoji: '🎮', g: ['#f97316', '#ef4444'], top: '12%', left: '6%', depth: 0.35, delay: '0s' },
  { emoji: '🎵', g: ['#06b6d4', '#3b82f6'], top: '22%', left: '84%', depth: 0.5, delay: '0.6s' },
  { emoji: '🔐', g: ['#334155', '#0ea5e9'], top: '58%', left: '4%', depth: 0.28, delay: '1.1s' },
  { emoji: '📝', g: ['#6366f1', '#8b5cf6'], top: '66%', left: '88%', depth: 0.42, delay: '0.3s' },
  { emoji: '🚀', g: ['#312e81', '#7c3aed'], top: '8%', left: '46%', depth: 0.6, delay: '0.9s' },
  { emoji: '🗣️', g: ['#22c55e', '#eab308'], top: '76%', left: '40%', depth: 0.2, delay: '1.5s' },
]

const SECTIONS = [
  {
    kicker: 'Discover', emoji: '🧭', title: 'Discover great apps',
    text: 'A curated marketplace with featured picks, trending charts, fresh releases and smart search across every category.',
    visual: 'discover',
  },
  {
    kicker: 'Safety', emoji: '🛡️', title: 'Safe downloads',
    text: 'Every package is validated and checksum-verified end to end — from the developer\u2019s upload to your device.',
    visual: 'safety',
  },
  {
    kicker: 'Create', emoji: '🚀', title: 'Developer publishing',
    text: 'Create app listings, upload releases through secure temporary sessions, and publish with one tap.',
    visual: 'publish',
  },
  {
    kicker: 'Speed', emoji: '⚡', title: 'Fast delivery',
    text: 'Packages stream through a global delivery pipeline — start downloading in seconds, with live progress and ETA.',
    visual: 'speed',
  },
  {
    kicker: 'Versions', emoji: '🏷️', title: 'Version management',
    text: 'Immutable version history for every app. Roll back, compare release notes, and grab previous builds anytime.',
    visual: 'versions',
  },
  {
    kicker: 'Platform', emoji: '🔐', title: 'Secure API infrastructure',
    text: 'Scoped, revocable API keys, rate limiting, and server-side authorization guard every endpoint of the platform.',
    visual: 'secure',
  },
]

function SectionVisual({ kind }) {
  if (kind === 'discover') {
    return (
      <div className="mini-cards">
        <div className="mini-card" style={{ top: '16%', left: '8%' }}>📸 Lumen Notes</div>
        <div className="mini-card" style={{ top: '40%', left: '62%', animationDelay: '.7s' }}>🏎️ Pixel Drift</div>
        <div className="mini-card" style={{ top: '68%', left: '22%', animationDelay: '1.3s' }}>🎧 Waveform</div>
      </div>
    )
  }
  if (kind === 'safety') return <div className="shield">🛡️</div>
  if (kind === 'publish') return <div className="rocket">🚀</div>
  if (kind === 'speed') {
    return (
      <div className="stack-viz">
        <div>📦 87%</div>
        <div className="progress"><div style={{ width: '87%' }} /></div>
        <div>⚡ 12.4 MB/s · 3s left</div>
      </div>
    )
  }
  if (kind === 'versions') {
    return (
      <div className="stack-viz">
        <div>🏷️ v1.2.0 — live</div>
        <div>🏷️ v1.1.0</div>
        <div>🏷️ v1.0.0</div>
      </div>
    )
  }
  return (
    <div className="stack-viz">
      <div>🔑 scoped API keys</div>
      <div>⏱️ rate limiting</div>
      <div>✅ server-side authz</div>
    </div>
  )
}

export default function Welcome() {
  const heroRef = useRef(null)
  const navigate = useNavigate()
  const { user } = useApp()

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const layers = heroRef.current?.querySelectorAll('[data-depth]') || []
      layers.forEach((el) => {
        const d = parseFloat(el.dataset.depth)
        el.style.translate = `0 ${y * d}px`
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
      { threshold: 0.15 },
    )
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el))

    // subtle tilt on the hero when the pointer moves (desktop)
    const tilt = (e) => {
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      const rx = ((e.clientY - cy) / cy) * -3
      const ry = ((e.clientX - cx) / cx) * 3
      heroRef.current?.querySelectorAll('.float-card').forEach((el, i) => {
        el.style.rotate = `${rx * (i % 2 ? 1 : -1)}deg ${ry}deg`
      })
    }
    window.addEventListener('pointermove', tilt)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', tilt)
      io.disconnect()
    }
  }, [])

  const words = ['Discover.', 'Download.', 'Create.']

  return (
    <div className="welcome">
      <section className="hero" ref={heroRef}>
        <div className="float-layer">
          {FLOATERS.map((f, i) => (
            <div
              key={i}
              className="float-card"
              data-depth={f.depth}
              style={{ top: f.top, left: f.left, animationDelay: f.delay }}
            >
              <div className="fc-ico" style={{ background: `linear-gradient(135deg, ${f.g[0]}, ${f.g[1]})` }}>
                {f.emoji}
              </div>
              <div className="fc-line" />
              <div className="fc-line" />
            </div>
          ))}
        </div>

        <div className="hero-inner">
          <div className="hero-badge"><span className="pulse" /> The independent app marketplace</div>
          <h1>
            {words.map((w, i) => (
              <span key={w} className={`w ${i === 2 ? 'grad' : ''}`} style={{ animationDelay: `${i * 0.14}s` }}>
                {w}&nbsp;
              </span>
            ))}
          </h1>
          <p className="sub">
            {user ? `Welcome back, ${user.username}. ` : ''}
            A beautiful home for the apps you love — and a launchpad for the ones you'll build.
          </p>
          <div className="hero-ctas">
            <button className="btn btn-primary" onClick={() => navigate('/home')}>Explore Apps</button>
            <button className="btn btn-outline" onClick={() => navigate(user ? '/dev' : '/signup')}>
              Become a Developer
            </button>
            {!user && (
              <>
                <button className="btn btn-ghost" onClick={() => navigate('/login')}>Login</button>
                <button className="btn btn-ghost" onClick={() => navigate('/signup')}>Sign Up</button>
              </>
            )}
          </div>

          <div className="cloud-viz" data-depth="0.12" aria-hidden="true">
            <svg viewBox="0 0 400 120" fill="none">
              <defs>
                <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
              <ellipse cx="200" cy="66" rx="120" ry="42" stroke="url(#cg)" strokeWidth="1.6" opacity="0.55" />
              <ellipse cx="200" cy="66" rx="72" ry="26" stroke="url(#cg)" strokeWidth="1.4" opacity="0.4" />
              <g className="orbit-dot" style={{ transformOrigin: '200px 66px' }}>
                <circle cx="320" cy="66" r="7" fill="#8b5cf6" />
              </g>
              <g className="orbit-dot" style={{ transformOrigin: '200px 66px', animationDuration: '9s', animationDirection: 'reverse' }}>
                <circle cx="272" cy="66" r="5" fill="#06b6d4" />
              </g>
              <ellipse cx="200" cy="70" rx="46" ry="18" fill="url(#cg)" opacity="0.18" />
              <circle cx="200" cy="66" r="13" fill="url(#cg)" />
              <text x="200" y="71" textAnchor="middle" fontSize="13" fill="#fff" fontWeight="700">A</text>
            </svg>
          </div>
        </div>

        <div className="scroll-hint" aria-hidden="true">⌄</div>
      </section>

      {SECTIONS.map((s, i) => (
        <section key={s.title} className="wsection reveal" style={{ transitionDelay: `${(i % 2) * 60}ms` }}>
          <div className="kicker">{s.kicker}</div>
          <h2>{s.title}</h2>
          <p>{s.text}</p>
          <div className="visual"><SectionVisual kind={s.visual} /><span style={{ fontSize: 60 }}>{''}</span></div>
        </section>
      ))}

      <section className="wsection reveal">
        <h2>Ready to jump in?</h2>
        <p>Join the marketplace — as a user, or as a creator.</p>
        <div className="hero-ctas">
          <button className="btn btn-primary" onClick={() => navigate('/home')}>Browse the store</button>
          <button className="btn btn-outline" onClick={() => navigate('/signup')}>Create an account</button>
        </div>
      </section>

      <footer className="welcome-footer">
        <div className="logo" style={{ justifyContent: 'center' }}><span className="logo-mark">A</span> APDS</div>
        <div className="links">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/help">Help</Link>
          <Link to="/home">Store</Link>
        </div>
        <div style={{ marginTop: 10 }}>© 2026 APDS · Discover. Download. Create.</div>
      </footer>
    </div>
  )
}
