import React from 'react'
import { Link, useNavigate } from 'react-router-dom'

const CONTENT = {
  privacy: {
    emoji: '🔒', title: 'Privacy policy',
    body: [
      ['What we store', 'Your account details (username, email, bcrypt-hashed password), your sessions, API key hashes, your wishlist and install history, and reviews you publish.'],
      ['What we never store', 'Plain-text passwords, payment data, or your device identifiers.'],
      ['What is public', 'The marketplace catalog — app listings, versions, reviews and download counts — is stored in a public data repository as part of how the platform works.'],
      ['Your controls', 'You can edit your profile or delete your account at any time from the Account page. Deleting your account removes your sessions and API keys immediately.'],
      ['Contact', 'Reach out through the Help page for any privacy request.'],
    ],
  },
  terms: {
    emoji: '📜', title: 'Terms of service',
    body: [
      ['The service', 'APDS is an independent app marketplace. Apps are provided by their developers; we distribute, we do not endorse.'],
      ['Accounts', 'You are responsible for your credentials and API keys. Keep them secret; rotate them if they leak.'],
      ['Publishing', 'Developers affirm they have the rights to the content they upload. Packages are validated and checksummed; malicious content is removed.'],
      ['Availability', 'The service is provided as-is, with best effort. Free-tier infrastructure may sleep or reset; published catalog data persists in versioned storage.'],
      ['Termination', 'We may suspend accounts that abuse the platform, the API, or the upload pipeline.'],
    ],
  },
  help: {
    emoji: '❓', title: 'Help & support',
    body: [
      ['Downloading apps', 'Tap Download on any app page. Progress, speed and ETA are shown in the Downloads tab. Packages are checksum-verified in transit.'],
      ['Publishing apps', 'Create a developer profile, then create an app listing, upload a release package (.apk / .aab / .zip) through a secure upload session, and publish. Validation and versioning are automatic.'],
      ['API access', 'Developers can create scoped, revocable API keys under Developer → API Keys. Use them with the Authorization: Bearer or X-API-Key header.'],
      ['Downloads & installs', 'Your Library keeps track of installed apps and your wishlist. Download history lives on your device.'],
      ['Something broken?', 'Try again in a minute — the platform may be waking up. If it persists, contact the operator of this deployment.'],
    ],
  },
}

export default function StaticPage({ page }) {
  const c = CONTENT[page] || CONTENT.help
  const navigate = useNavigate()
  return (
    <main className="page">
      <div className="row" style={{ margin: '8px 2px 14px' }}>
        <button className="iconbtn" onClick={() => navigate(-1)} aria-label="Back">←</button>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: '-0.02em' }}>{c.emoji} {c.title}</h1>
      </div>
      <div className="stack">
        {c.body.map(([h, p]) => (
          <div key={h} className="card">
            <div style={{ fontWeight: 800, marginBottom: 7 }}>{h}</div>
            <p className="tiny muted" style={{ margin: 0, lineHeight: 1.7 }}>{p}</p>
          </div>
        ))}
      </div>
      <div className="center tiny muted" style={{ marginTop: 18 }}>
        <Link to="/" style={{ color: 'var(--brand1)', fontWeight: 700 }}>← APDS home</Link>
      </div>
    </main>
  )
}
