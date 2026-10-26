import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, Link } from 'react-router'
import './App.css'

const DecisionDayPage = lazy(() => import('./pages/DecisionDayPage'))
const AccuracyPage = lazy(() => import('./pages/AccuracyPage'))

export default function App() {
  return (
    <Suspense fallback={<main className="state-panel" role="status"><span>Loading workspace…</span></main>}>
      <Routes>
        <Route path="/" element={<Navigate to="/decision-day" replace />} />
        <Route path="/decision-day" element={<DecisionDayPage />} />
        <Route path="/accuracy" element={<AccuracyPage />} />
        <Route path="*" element={<main className="not-found"><span className="section-label">404</span><h1>This view does not exist</h1><p>Return to the January 2026 decision archive.</p><Link className="button primary" to="/decision-day">Open Decision Day</Link></main>} />
      </Routes>
    </Suspense>
  )
}
