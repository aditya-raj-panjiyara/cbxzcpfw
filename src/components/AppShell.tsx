import { Activity, Database } from 'lucide-react'
import { NavLink } from 'react-router'
import type { ReactNode } from 'react'

export function AppShell({ children, onStatus }: { children: ReactNode; onStatus: () => void }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/decision-day" className="brand" aria-label="Wind Forecast Decisions home">
          <Activity aria-hidden="true" size={22} strokeWidth={1.7} />
          <span><strong>WIND</strong><span>Forecast decisions</span></span>
        </NavLink>
        <nav className="primary-nav" aria-label="Primary navigation">
          <NavLink to="/decision-day" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Decision Day</NavLink>
          <NavLink to="/accuracy" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Accuracy</NavLink>
        </nav>
        <div className="header-actions">
          <span className="archive-label">JAN 2026 ARCHIVE</span>
          <button className="text-button status-button" onClick={onStatus}><Database size={16} aria-hidden="true" />Data status</button>
        </div>
      </header>
      <div className="scope-strip">Purchase decisions: 1–31 January 2026 <span>·</span> Elexon national wind generation</div>
      {children}
    </div>
  )
}
