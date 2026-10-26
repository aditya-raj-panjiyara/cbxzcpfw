import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDateTime, numberFormat } from '@/lib/format'
import type { SourceStatus } from '@/types/wind'

interface SourcePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: SourceStatus | null
  coverage?: Record<string, number>
}

export function SourcePanel({ open, onOpenChange, source, coverage }: SourcePanelProps) {
  const warnings = [...(source?.warnings ?? []), ...(source?.warning ? [source.warning] : [])]
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="side-panel" aria-describedby="data-status-description">
        <SheetHeader>
          <span className="section-label">SOURCE EVIDENCE</span>
          <SheetTitle>Data status</SheetTitle>
          <SheetDescription id="data-status-description">Refresh, cache, and coverage for the current view.</SheetDescription>
        </SheetHeader>
        {!source ? <p className="muted">Load a forecast or accuracy view to inspect its source status.</p> : <>
          <section className="panel-section">
            <h3>Current source</h3>
            <p className="muted">Elexon WINDFOR forecasts + FUELHH actual generation</p>
            <dl className="detail-list">
              <div><dt>Status</dt><dd className="status-text"><span className={`status-dot ${source.cached ? 'warning' : ''}`} />{source.cached ? 'Cached / partial' : 'Retrieved'}</dd></div>
              <div><dt>Last refresh</dt><dd>{formatDateTime(source.refreshedAt)}</dd></div>
              <div><dt>Forecast records</dt><dd>{source.forecastRecords == null ? 'N/A' : numberFormat.format(source.forecastRecords)}</dd></div>
              <div><dt>Actual records</dt><dd>{source.actualRecords == null ? 'N/A' : numberFormat.format(source.actualRecords)}</dd></div>
            </dl>
          </section>
          {coverage && <section className="panel-section"><h3>Current-view coverage</h3><dl className="detail-list">{Object.entries(coverage).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1')}</dt><dd>{numberFormat.format(value)}</dd></div>)}</dl></section>}
          {warnings.length > 0 && <section className="panel-section warning-box"><h3>Source warnings</h3>{warnings.map((warning, index) => <p key={index}>{warning}</p>)}</section>}
          <p className="panel-note">Missing or excluded values are never counted as zero. Cached values remain labelled until a source refresh succeeds.</p>
        </>}
      </SheetContent>
    </Sheet>
  )
}
