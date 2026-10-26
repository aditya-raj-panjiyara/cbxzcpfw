import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'

export function LoadingState({ label = 'Retrieving decision-relevant wind data' }: { label?: string }) {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <div className="skeleton-line short" /><div className="skeleton-chart" /><div className="skeleton-line" />
      <span>{label}…</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state-panel error-state" role="alert">
      <AlertTriangle size={28} aria-hidden="true" />
      <h2>Wind data is unavailable</h2>
      <p>{message}</p>
      <p className="muted">No forecast values have been substituted or treated as zero.</p>
      <button className="button primary" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" />Retry request</button>
    </div>
  )
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="state-panel"><Inbox size={28} aria-hidden="true" /><h2>{title}</h2><p>{message}</p></div>
}
