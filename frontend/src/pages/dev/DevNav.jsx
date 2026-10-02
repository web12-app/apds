import React from 'react'
import { NavLink } from 'react-router-dom'

export default function DevNav() {
  return (
    <div className="dev-nav">
      <NavLink to="/dev" end>Overview</NavLink>
      <NavLink to="/dev/apps">My Apps</NavLink>
      <NavLink to="/dev/apps/new">Create App</NavLink>
      <NavLink to="/dev/stats">Statistics</NavLink>
      <NavLink to="/dev/keys">API Keys</NavLink>
    </div>
  )
}
