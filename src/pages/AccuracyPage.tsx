import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Download, RotateCcw } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { AppShell } from '@/components/AppShell'
import { ErrorHeatmap } from '@/components/charts/ErrorHeatmap'
import { ErrorHistogram } from '@/components/charts/ErrorHistogram'
import { ForecastTimeline } from '@/components/charts/ForecastTimeline'
import { EmptyState, ErrorState, LoadingState } from '@/components/DataStates'
import { SourcePanel } from '@/components/SourcePanel'
import { getAccuracy } from '@/lib/api'
import { downloadCsv, formatDate, formatMW, formatNumber, formatSigned, formatTime } from '@/lib/format'
import type { AccuracyResponse } from '@/types/wind'

const DEFAULTS = { decisionFrom: '2026-01-01', decisionTo: '2026-01-31', deliveryFrom: '', deliveryTo: '', fromTime: '', toTime: '' }
type Filters = typeof DEFAULTS

export default function AccuracyPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initial: Filters = {
    decisionFrom: searchParams.get('decisionFrom') ?? DEFAULTS.decisionFrom,
    decisionTo: searchParams.get('decisionTo') ?? DEFAULTS.decisionTo,
    deliveryFrom: searchParams.get('deliveryFrom') ?? '',
    deliveryTo: searchParams.get('deliveryTo') ?? '',
    fromTime: searchParams.get('fromTime') ?? '',
    toTime: searchParams.get('toTime') ?? '',
  }
  const [draft, setDraft] = useState<Filters>(initial)
  const [validation, setValidation] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [statusOpen, setStatusOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    Object.keys(DEFAULTS).forEach((key) => {
      const value = searchParams.get(key)
      if (value) params.set(key, value)
    })
    if (!params.has('decisionFrom')) params.set('decisionFrom', DEFAULTS.decisionFrom)
    if (!params.has('decisionTo')) params.set('decisionTo', DEFAULTS.decisionTo)
    return params
  }, [searchParams])
  const queryKey = query.toString()
  const requestKey = `${queryKey}:${retry}`
  const [result, setResult] = useState<{ key: string; data?: AccuracyResponse; error?: string } | null>(null)
  const current = result?.key === requestKey ? result : null
  const data = current?.data ?? null
  const error = current?.error ?? null
  const loading = !current

  useEffect(() => {
    const restoreDraft = () => {
      const params = new URLSearchParams(window.location.search)
      setDraft({
        decisionFrom: params.get('decisionFrom') ?? DEFAULTS.decisionFrom,
        decisionTo: params.get('decisionTo') ?? DEFAULTS.decisionTo,
        deliveryFrom: params.get('deliveryFrom') ?? '',
        deliveryTo: params.get('deliveryTo') ?? '',
        fromTime: params.get('fromTime') ?? '',
        toTime: params.get('toTime') ?? '',
      })
    }
    window.addEventListener('popstate', restoreDraft)
    return () => window.removeEventListener('popstate', restoreDraft)
  }, [])

  useEffect(() => {
    let active = true
    getAccuracy(new URLSearchParams(queryKey)).then((data) => {
      if (active) setResult({ key: requestKey, data })
    }).catch((reason: Error) => {
      if (active) setResult({ key: requestKey, error: reason.message })
    })
    return () => { active = false }
  }, [queryKey, requestKey])

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault()
    if (draft.decisionFrom > draft.decisionTo) { setValidation('The decision start date must be on or before the end date.'); return }
    if (draft.deliveryFrom && draft.deliveryTo && draft.deliveryFrom > draft.deliveryTo) { setValidation('The delivery start date must be on or before the end date.'); return }
    if (draft.fromTime && draft.toTime && draft.fromTime > draft.toTime) { setValidation('The start time must be on or before the end time.'); return }
    setValidation(null)
    const params = new URLSearchParams()
    Object.entries(draft).forEach(([key, value]) => { if (value) params.set(key, value) })
    setSearchParams(params)
  }
  const reset = () => { setDraft(DEFAULTS); setValidation(null); setSearchParams(new URLSearchParams()) }
  const update = (key: keyof Filters, value: string) => setDraft((current) => ({ ...current, [key]: value }))
  const largestErrors = useMemo(() => [...(data?.pairs ?? [])].sort((a, b) => Math.abs(b.error) - Math.abs(a.error)).slice(0, 8), [data])
  const exportRows = () => {
    if (!data) return
    const ok = downloadCsv(`wind-accuracy-${data.decisionFrom}-to-${data.decisionTo}.csv`, data.pairs.map((pair) => ({
      decisionDate: pair.decisionDate, deliveryDate: pair.deliveryDate, deliveryHour: pair.startTime,
      forecastMW: pair.forecast, actualHourlyMeanMW: pair.actual, errorMW: pair.error, publishedAt: pair.publishTime,
    })))
    setNotice(ok ? 'CSV downloaded with the current filters.' : 'No matched rows are available to export.')
  }

  return (
    <AppShell onStatus={() => setStatusOpen(true)}>
      <main className="workspace-grid">
        <aside className="control-rail">
          <div className="rail-heading"><span className="section-label">ANALYSIS INPUT</span><h1>Accuracy</h1><p>Evaluate each cutoff-selected forecast against hourly actual-generation means.</p></div>
          <form className="filter-form" onSubmit={applyFilters} noValidate>
            <fieldset><legend>Decision dates</legend><div className="date-pair"><label>From<input type="date" min="2026-01-01" max="2026-01-31" required value={draft.decisionFrom} onChange={(e) => update('decisionFrom', e.target.value)} /></label><label>To<input type="date" min="2026-01-01" max="2026-01-31" required value={draft.decisionTo} onChange={(e) => update('decisionTo', e.target.value)} /></label></div></fieldset>
            <details className="optional-filters" open={Boolean(draft.deliveryFrom || draft.deliveryTo)}><summary>Delivery date filters <span>Optional</span></summary><div className="date-pair"><label>From<input type="date" min="2026-01-02" max="2026-02-01" value={draft.deliveryFrom} onChange={(e) => update('deliveryFrom', e.target.value)} /></label><label>To<input type="date" min="2026-01-02" max="2026-02-01" value={draft.deliveryTo} onChange={(e) => update('deliveryTo', e.target.value)} /></label></div></details>
            <details className="optional-filters" open={Boolean(draft.fromTime || draft.toTime)}><summary>Time of day <span>Optional</span></summary><div className="date-pair"><label>From<input type="time" value={draft.fromTime} onChange={(e) => update('fromTime', e.target.value)} /></label><label>To<input type="time" value={draft.toTime} onChange={(e) => update('toTime', e.target.value)} /></label></div></details>
            {validation && <p className="inline-error" role="alert">{validation}</p>}
            <button className="button primary full-width" type="submit">Apply filters<ArrowRight size={16} /></button>
            <button className="text-button reset-button" type="button" onClick={reset}><RotateCcw size={14} />Reset to full January</button>
          </form>
          <p className="rail-note">All metrics, charts, and counts use the same filtered population.</p>
        </aside>

        <section className="main-stage" aria-live="polite">
          {loading && <LoadingState label="Calculating cutoff-selected forecast accuracy" />}
          {!loading && error && <ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} />}
          {!loading && !error && data && <>
            <div className="stage-heading"><div><span className="section-label">FORECAST − ACTUAL</span><h2>Forecast performance</h2><p>{formatDate(data.decisionFrom)} – {formatDate(data.decisionTo)} · Hourly matched pairs</p></div><button className="button secondary" onClick={exportRows}><Download size={16} />Export CSV</button></div>
            {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice(null)}>Dismiss</button></div>}
            {data.source.warnings && data.source.warnings.length > 0 && <div className="warning-banner" role="warning">Some source requests failed. Results may be cached or partial. <button onClick={() => setStatusOpen(true)}>Inspect source</button></div>}
            <div className="coverage-line"><span><strong>{formatNumber(data.coverage.matchedPairs)}</strong> matched pairs</span><span><strong>{formatNumber(data.coverage.excludedPairs)}</strong> excluded periods</span><span><strong>{data.coverage.loadedDecisions}/{data.coverage.requestedDecisions}</strong> decision days loaded</span></div>
            <div className="metric-grid">
              <div className="metric-block"><span>MAE <button className="definition" title="Mean absolute error: typical absolute error magnitude in this filtered sample.">Definition</button></span><strong>{formatMW(data.metrics.mae)}</strong><small>Typical absolute error</small></div>
              <div className="metric-block"><span>RMSE <button className="definition" title="Root mean squared error: penalises larger misses more strongly.">Definition</button></span><strong>{formatMW(data.metrics.rmse)}</strong><small>Larger misses weigh more</small></div>
              <div className="metric-block"><span>Bias <button className="definition" title="Mean signed error. Positive means overforecasting; negative means underforecasting.">Definition</button></span><strong>{formatSigned(data.metrics.bias)}</strong><small>{data.metrics.bias == null ? 'No matched evidence' : data.metrics.bias > 0 ? 'Tended to overforecast' : data.metrics.bias < 0 ? 'Tended to underforecast' : 'No mean directional bias'}</small></div>
            </div>
            {data.pairs.length === 0 ? <EmptyState title="No matched forecast–actual pairs" message="Adjust the filters or inspect data coverage. Missing values are not counted as zero." /> : <>
              <div className="table-heading"><div><h3>Forecast vs actual over time</h3><p>Use 1D / 1W / All or drag the strip below the chart to zoom. Click a point to open that decision.</p></div></div>
              <ForecastTimeline key={queryKey} pairs={data.pairs} />
              <div className="table-heading"><div><h3>Error by day and hour</h3><p>Each cell is one delivery hour. Hatched cells had no matched pair and are excluded, not zero.</p></div></div>
              <ErrorHeatmap pairs={data.pairs} decisionFrom={data.decisionFrom} decisionTo={data.decisionTo} deliveryFrom={searchParams.get('deliveryFrom')} deliveryTo={searchParams.get('deliveryTo')} fromTime={searchParams.get('fromTime')} toTime={searchParams.get('toTime')} />
              <div className="table-heading"><div><h3>Error distribution</h3><p>How often each size of miss occurred in this filtered sample.</p></div><span>{formatNumber(data.pairs.length)} hours</span></div>
              <ErrorHistogram errors={data.pairs.map((pair) => pair.error)} bias={data.metrics.bias} p05={data.errorRange.p05} p95={data.errorRange.p95} />
              <div className="table-heading"><div><h3>Largest absolute errors</h3><p>Inspect the forecast versions and decision context behind each miss.</p></div><span>Top {largestErrors.length}</span></div>
              <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Delivery hour</th><th>Decision</th><th>Forecast</th><th>Actual mean</th><th>Error</th><th><span className="sr-only">Inspect</span></th></tr></thead><tbody>{largestErrors.map((pair) => <tr key={`${pair.decisionDate}-${pair.startTime}`}><td><strong>{formatDate(pair.startTime)} · {formatTime(pair.startTime)}</strong></td><td>{formatDate(pair.decisionDate)}</td><td>{formatMW(pair.forecast)}</td><td>{formatMW(pair.actual)}</td><td className={pair.error >= 0 ? 'error-positive' : 'error-negative'}>{formatSigned(pair.error)}</td><td><Link className="table-action" to={`/decision-day?decisionDate=${pair.decisionDate}&deliveryStart=${encodeURIComponent(pair.startTime)}`}>Inspect</Link></td></tr>)}</tbody></table></div>
            </>}
            {data.errorRange.p05 != null && <div className="range-note"><span className="section-label">EMPIRICAL ERROR RANGE</span><strong>{formatSigned(data.errorRange.p05)} to {formatSigned(data.errorRange.p95)}</strong><p>5th–95th percentile from {data.errorRange.sampleSize} matched hourly pairs. Historical evidence, not a guarantee of future error.</p></div>}
          </>}
        </section>

        {data && !loading && !error && <aside className="evidence-rail"><section><span className="section-label">HOW TO READ</span><h3>Error convention</h3><p><strong>Forecast − actual.</strong> Positive values mean expected wind exceeded actual wind.</p></section><section><h3>Aligned at hourly resolution</h3><p>Each hourly forecast is compared with the mean of its two half-hour actuals. Hours with incomplete actuals are excluded.</p></section><section><h3>Evidence, not a promise</h3><p>January 2026 errors describe this historical sample. They do not bound the next forecast error.</p></section><section className="method-note"><h3>Data confidence</h3><p>{data.coverage.loadedDecisions} of {data.coverage.requestedDecisions} requested decision days loaded.</p><button className="text-link" onClick={() => setStatusOpen(true)}>Inspect data status<ArrowRight size={14} /></button></section></aside>}
      </main>
      <SourcePanel open={statusOpen} onOpenChange={setStatusOpen} source={data?.source ?? null} coverage={data ? { matchedPairs: data.coverage.matchedPairs, excludedPairs: data.coverage.excludedPairs, loadedDecisions: data.coverage.loadedDecisions } : undefined} />
    </AppShell>
  )
}
