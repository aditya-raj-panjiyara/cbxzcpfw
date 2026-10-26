import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { RevisionChart } from '@/components/charts/RevisionChart'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getRevisions } from '@/lib/api'
import { formatDate, formatDateTime, formatMW, formatSigned, formatTime } from '@/lib/format'
import type { DecisionDay, Period, RevisionResponse } from '@/types/wind'

interface PeriodPanelProps {
  period: Period | null
  decision: DecisionDay
  onClose: () => void
}

export function PeriodPanel({ period, decision, onClose }: PeriodPanelProps) {
  const requestKey = period ? `${decision.decisionDate}:${period.forecastStartTime}` : null
  const [result, setResult] = useState<{ key: string; data?: RevisionResponse; error?: string } | null>(null)
  const current = requestKey && result?.key === requestKey ? result : null
  const revisionData = current?.data ?? null
  const error = current?.error ?? null

  useEffect(() => {
    if (!period || !requestKey) return
    let active = true
    getRevisions(decision.decisionDate, period.forecastStartTime).then((data) => {
      if (active) setResult({ key: requestKey, data })
    }).catch((reason: Error) => {
      if (active) setResult({ key: requestKey, error: reason.message })
    })
    return () => { active = false }
  }, [period, decision.decisionDate, requestKey])

  return (
    <Sheet open={Boolean(period)} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="side-panel period-panel">
        {period && <>
          <SheetHeader>
            <span className="section-label">DELIVERY PERIOD</span>
            <SheetTitle>{formatDate(period.startTime)} · {formatTime(period.startTime)}–{formatTime(period.endTime)}</SheetTitle>
            <SheetDescription>Decision {formatDate(decision.decisionDate)} · Cutoff {decision.cutoffLocalTime} GMT</SheetDescription>
          </SheetHeader>
          <section className="selected-value">
            <span>Selected at cutoff</span>
            <strong>{formatMW(period.forecast)}</strong>
            <small>Published {formatDateTime(period.publishTime)}</small>
          </section>
          <dl className="detail-list compact">
            <div><dt>Actual generation</dt><dd>{period.actual == null ? 'Not available' : formatMW(period.actual)}</dd></div>
            <div><dt>Error</dt><dd>{period.error == null ? 'Not calculable' : `${formatSigned(period.error)} · ${period.error > 0 ? 'Overforecast' : period.error < 0 ? 'Underforecast' : 'Exact'}`}</dd></div>
            <div><dt>Lead time</dt><dd>{period.leadTimeHours == null ? 'N/A' : `${period.leadTimeHours} hours`}</dd></div>
          </dl>
          <p className="panel-note">Error = forecast − actual.</p>
          <section className="panel-section revisions-section">
            <h3>Forecast history</h3>
            {error && <p className="inline-error">{error}</p>}
            {!error && !revisionData && <p className="muted">Retrieving forecast versions…</p>}
            {revisionData && revisionData.revisions.length === 0 && <p className="muted">No forecast versions were retrieved for this delivery hour.</p>}
            {revisionData && revisionData.revisions.length > 0 && <RevisionChart revisions={revisionData.revisions} cutoff={revisionData.cutoff} actual={period.actual} />}
            {revisionData && revisionData.revisions.length > 0 && <div className="revision-table-wrap"><table className="revision-table"><thead><tr><th>Published</th><th>Forecast</th><th>Change</th><th>Eligibility</th></tr></thead><tbody>
              {revisionData.revisions.map((revision) => <tr key={revision.publishTime} className={revision.selected ? 'selected-revision' : ''}>
                <td>{formatDateTime(revision.publishTime)}</td><td>{formatMW(revision.generation)}</td><td>{revision.change == null ? 'N/A' : formatSigned(revision.change)}</td><td>{revision.selected ? 'Selected' : revision.eligible ? 'Before cutoff' : 'After cutoff · review only'}</td>
              </tr>)}
            </tbody></table></div>}
          </section>
          <Link className="button secondary panel-link" to={`/accuracy?decisionFrom=${decision.decisionDate}&decisionTo=${decision.decisionDate}`}>View this decision in Accuracy</Link>
        </>}
      </SheetContent>
    </Sheet>
  )
}
