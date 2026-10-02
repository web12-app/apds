import { useEffect, useState } from 'react'

const API = '/api'

export default function App() {
  const [health, setHealth] = useState('checking…')
  const [records, setRecords] = useState([])
  const [name, setName] = useState('')

  const refresh = async () => {
    const res = await fetch(`${API}/records`)
    setRecords(await res.json())
  }

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((d) => setHealth(d.status))
      .catch(() => setHealth('backend unreachable'))
    refresh()
  }, [])

  const add = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    await fetch(`${API}/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    setName('')
    refresh()
  }

  const remove = async (id) => {
    await fetch(`${API}/records/${id}`, { method: 'DELETE' })
    refresh()
  }

  return (
    <main>
      <h1>apds</h1>
      <p>
        Backend health: <code>{health}</code>
      </p>

      <form onSubmit={add}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New record name…"
        />
        <button type="submit">Add</button>
      </form>

      <ul>
        {records.map((r) => (
          <li key={r.id}>
            #{r.id} — {r.name}{' '}
            <button onClick={() => remove(r.id)}>✕</button>
          </li>
        ))}
        {records.length === 0 && <li>No records yet.</li>}
      </ul>
    </main>
  )
}
