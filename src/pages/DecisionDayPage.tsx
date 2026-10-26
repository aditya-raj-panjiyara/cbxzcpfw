import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Download, Info } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { Area, CartesianGrid, ComposedChart, Customized, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AppShell } from '@/components/AppShell'
import { Crosshair } from '@/components/charts/chartLayers'
import { ErrorState, LoadingState } from '@/components/DataStates'
import { PeriodPanel } from '@/components/PeriodPanel'
import { SourcePanel } from '@/components/SourcePanel'
import { useCrosshair } from '@/hooks/use-crosshair'
import { getDecisionDay } from '@/lib/api'
import { downloadCsv, formatDate, formatDateTime, formatMW, formatNumber, formatSigned, formatTime } from '@/lib/format'
import type { DecisionDay, Period } from '@/types/wind'

const DEFAULT_DECISION = '2026-01-30'

interface ChartPoint {
  x: number
  period: Period
  forecast: number | null
  actual: number | null
  over: [number, number] | null
  under: [number, number] | null
}

// Both series are period averages, so they are drawn as steps. The gap is split into
// over/under bands; a zero-height band (not null) keeps the step areas continuous.
function toChartPoints(periods: Period[]): ChartPoint[] {
  const points = periods.map((period) => {
    const { forecast, actual } = period
    const both = forecast != null && actual != null
    return {
      x: Date.parse(period.startTime), period, forecast, actual,
      over: both ? [actual, Math.max(forecast, actual)] as [number, number] : null,
      under: both ? [Math.min(forecast, actual), actual] as [number, number] : null,
    }
  })
  const last = periods[periods.length - 1]
  if (last) points.push({ ...points[points.length - 1], x: Date.parse(last.endTime) })
  return points
}

const hourTick = (value: number) => formatTime(new Date(value).toISOString())
const mwValue = (value: number) => formatNumber(value)

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: ChartPoint }> }) {
  const period = payload?.[0]?.payload?.period
  if (!active || !period) return null
  return <div className="chart-tooltip"><strong>{formatTime(period.startTime)}–{formatTime(period.endTime)}</strong><span>Selected at cutoff <b>{formatMW(period.forecast)}</b></span><span>Actual <b>{period.actual == null ? 'Not available' : formatMW(period.actual)}</b></span><span>Error <b>{formatSigned(period.error)}</b></span></div>
}

export default function DecisionDayPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const decisionDate = searchParams.get('decisionDate') ?? DEFAULT_DECISION
  const selectedStart = searchParams.get('deliveryStart')
  const [retry, setRetry] = useState(0)
  const requestKey = `${decisionDate}:${retry}`
  const [result, setResult] = useState<{ key: string; data?: DecisionDay; error?: string } | null>(null)
  const current = result?.key === requestKey ? result : null
  const data = current?.data ?? null
  const error = current?.error ?? null
  const loading = !current
  const [statusOpen, setStatusOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getDecisionDay(decisionDate).then((data) => {
      if (active) setResult({ key: requestKey, data })
    }).catch((reason: Error) => {
      if (active) setResult({ key: requestKey, error: reason.message })
    })
    return () => { active = false }
  }, [decisionDate, requestKey])

  const selectedPeriod = useMemo(() => data?.periods.find((period) => period.startTime === selectedStart) ?? null, [data, selectedStart])
  const chartPoints = useMemo(() => toChartPoints(data?.periods ?? []), [data])
  const chartDomain: [number, number] = chartPoints.length ? [chartPoints[0].x, chartPoints[chartPoints.length - 1].x] : [0, 1]
  const chartTicks = chartPoints.filter((point) => point.x % (3 * 3_600_000) === 0).map((point) => point.x)
  const crosshair = useCrosshair()
  const openPeriod = (period: Period) => {
    const next = new URLSearchParams(searchParams)
    next.set('deliveryStart', period.startTime)
    setSearchParams(next)
  }
  const closePeriod = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('deliveryStart')
    setSearchParams(next)
  }
  const exportRows = () => {
    if (!data) return
    const ok = downloadCsv(`wind-decision-${data.decisionDate}.csv`, data.periods.map((period) => ({
      decisionDate: data.decisionDate, cutoff: data.cutoff, deliveryStart: period.startTime,
      forecastHour: period.forecastStartTime, forecastMW: period.forecast, publishedAt: period.publishTime,
      actualMW: period.actual, errorMW: period.error,
    })))
    setNotice(ok ? 'CSV downloaded with the current decision context.' : 'No rows are available to export.')
  }

  return (
    <AppShell onStatus={() => setStatusOpen(true)}>
      <main className="workspace-grid">
        <aside className="control-rail">
          <div className="rail-heading"><span className="section-label">DECISION INPUT</span><h1>Decision Day</h1><p>Reconstruct the national wind forecast available at the purchasing cutoff.</p></div>
          <label className="field-label" htmlFor="decision-date">Purchase decision date</label>
          <input id="decision-date" className="date-input" type="date" min="2026-01-01" max="2026-01-31" value={decisionDate} onChange={(event) => {
            const next = new URLSearchParams(searchParams); next.set('decisionDate', event.target.value); next.delete('deliveryStart'); setSearchParams(next)
          }} />
          <p className="field-help">The archive is filtered by decision date, not delivery date.</p>
          {data && <dl className="context-list">
            <div><dt>Delivery day</dt><dd>{formatDate(data.deliveryDate)}</dd></div>
            <div><dt>Purchasing cutoff</dt><dd>{data.cutoffLocalTime} GMT</dd></div>
            <div><dt>Forecast resolution</dt><dd>Hourly</dd></div>
            <div><dt>Actual resolution</dt><dd>Half-hourly</dd></div>
          </dl>}
          <div className="rail-rule" />
          <Link className="button secondary full-width" to={`/accuracy?decisionFrom=${decisionDate}&decisionTo=${decisionDate}`}>View historical accuracy<ArrowRight size={16} aria-hidden="true" /></Link>
          <p className="rail-note"><Info size={15} aria-hidden="true" />Selected forecast = latest version published at or before the cutoff.</p>
        </aside>

        <section className="main-stage" aria-live="polite">
          {loading && <LoadingState />}
          {!loading && error && <ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} />}
          {!loading && !error && data && <>
            <div className="stage-heading">
              <div><span className="section-label">DELIVERY {formatDate(data.deliveryDate).toUpperCase()}</span><h2>National wind generation</h2><p>Hourly selected forecast and half-hourly actual generation · MW</p></div>
              <button className="button secondary" onClick={exportRows}><Download size={16} aria-hidden="true" />Export CSV</button>
            </div>
            {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss notification">Dismiss</button></div>}
            {data.source.warning && <div className="warning-banner" role="warning">Source refresh failed. Showing cached or partial data. <button onClick={() => setStatusOpen(true)}>Inspect source</button></div>}
            {data.coverage.forecastHours === 0 && <div className="warning-banner" role="status">No decision-relevant WINDFOR forecasts were returned for this date. Actual generation remains visible where available.</div>}
            <div className="coverage-line">
              <span><strong>{data.coverage.forecastHours}/{data.coverage.expectedForecastHours}</strong> forecast hours</span>
              <span><strong>{data.coverage.actualPeriods}/{data.coverage.expectedActualPeriods}</strong> actual periods</span>
              <span>Refreshed <strong>{formatDateTime(data.source.refreshedAt)}</strong></span>
            </div>
            <div className="chart-frame" aria-label="Forecast and actual wind generation chart">
              <div className="chart-legend"><span><i className="legend-line forecast" />Selected at cutoff (hourly)</span><span><i className="legend-line actual" />Actual (half-hourly)</span><span><i className="legend-box over" />Overforecast</span><span><i className="legend-box under" />Underforecast</span><span className="chart-unit">Generation (MW) · click to inspect</span></div>
              <ResponsiveContainer width="100%" height={330}>
                <ComposedChart data={chartPoints} margin={{ top: 16, right: 20, bottom: 4, left: 4 }} className="clickable-chart" {...crosshair.handlers}
                  onClick={(state) => { const point = state?.activePayload?.[0]?.payload as ChartPoint | undefined; if (point) openPeriod(point.period) }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="2 4" />
                  <XAxis dataKey="x" type="number" domain={chartDomain} ticks={chartTicks} tickFormatter={hourTick} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }} />
                  <YAxis tickFormatter={(value) => `${Number(value) / 1000}k`} tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }} />
                  {selectedPeriod && <ReferenceArea x1={Date.parse(selectedPeriod.startTime)} x2={Date.parse(selectedPeriod.endTime)} fill="var(--accent)" fillOpacity={0.25} />}
                  <Tooltip content={<ChartTooltip />} cursor={false} />
                  <Area type="stepAfter" dataKey="over" stroke="none" fill="var(--overforecast)" fillOpacity={0.3} isAnimationActive={false} activeDot={false} />
                  <Area type="stepAfter" dataKey="under" stroke="none" fill="var(--underforecast)" fillOpacity={0.3} isAnimationActive={false} activeDot={false} />
                  <Line name="Actual" type="stepAfter" dataKey="actual" stroke="var(--actual)" strokeWidth={1.4} dot={false} connectNulls={false} isAnimationActive={false} />
                  <Line name="Selected at cutoff" type="stepAfter" dataKey="forecast" stroke="var(--forecast)" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                  <Customized component={<Crosshair pointerY={crosshair.pointerY} formatX={hourTick} formatY={mwValue} />} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="table-heading"><div><h3>Half-hour detail</h3><p>The hourly forecast repeats across its two actual-generation periods.</p></div><span>{data.periods.length} periods</span></div>
            <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Delivery period</th><th>Selected forecast</th><th>Published</th><th>Actual</th><th>Error</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>
              {data.periods.map((period) => <tr key={period.startTime}>
                <td><strong>{formatTime(period.startTime)}–{formatTime(period.endTime)}</strong><small>{formatDate(period.startTime, { day: '2-digit', month: 'short', timeZone: 'UTC' })}</small></td>
                <td>{period.forecast == null ? <span className="missing">No eligible forecast</span> : formatMW(period.forecast)}</td>
                <td>{period.publishTime ? formatDateTime(period.publishTime) : 'N/A'}</td>
                <td>{period.actual == null ? <span className="missing">Not available</span> : formatMW(period.actual)}</td>
                <td className={period.error == null ? '' : period.error > 0 ? 'error-positive' : period.error < 0 ? 'error-negative' : ''}>{formatSigned(period.error)}</td>
                <td><button className="table-action" onClick={() => openPeriod(period)}>Open</button></td>
              </tr>)}
            </tbody></table></div>
          </>}
        </section>

        {data && !loading && !error && <aside className="evidence-rail">
          <section><span className="section-label">DECISION BRIEF</span><h3>What was knowable</h3><p>This view excludes forecast versions published after {data.cutoffLocalTime} GMT on {formatDate(data.decisionDate)}.</p></section>
          <section><h3>Coverage</h3><div className="big-ratio">{formatNumber(data.coverage.matchedPeriods)}<span>/ 48</span></div><p>half-hour periods with both forecast and actual values.</p></section>
          <section><h3>Accuracy convention</h3><p>{data.accuracyNote}</p><p>Per-period errors shown here are descriptive. Accuracy metrics use hourly matched pairs.</p></section>
          <section className="method-note"><h3>Source</h3><p>Elexon WINDFOR + FUELHH</p><button className="text-link" onClick={() => setStatusOpen(true)}>Inspect data status<ArrowRight size={14} /></button></section>
        </aside>}
      </main>
      {data && <PeriodPanel period={selectedPeriod} decision={data} onClose={closePeriod} />}
      <SourcePanel open={statusOpen} onOpenChange={setStatusOpen} source={data?.source ?? null} coverage={data ? { forecastHours: data.coverage.forecastHours, actualPeriods: data.coverage.actualPeriods, matchedPeriods: data.coverage.matchedPeriods } : undefined} />
    </AppShell>
  )
}
