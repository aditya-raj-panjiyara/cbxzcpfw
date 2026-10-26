import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Brush, CartesianGrid, ComposedChart, Customized, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Crosshair } from '@/components/charts/chartLayers'
import { useCrosshair } from '@/hooks/use-crosshair'
import { formatDate, formatMW, formatNumber, formatSigned, formatTime } from '@/lib/format'
import type { AccuracyPair } from '@/types/wind'

interface TimelinePoint { x: number; forecast: number | null; actual: number | null; pair: AccuracyPair | null }

const HOUR = 3_600_000
const RANGES = [{ label: '1D', hours: 24 }, { label: '1W', hours: 24 * 7 }, { label: 'All', hours: Infinity }]
const tick = { fill: 'var(--muted)', fontSize: 10, fontFamily: 'IBM Plex Mono' }
const dayTick = (value: number) => formatDate(new Date(value).toISOString(), { day: '2-digit', month: 'short', timeZone: 'UTC' })
const crossTick = (value: number) => `${dayTick(value)} ${formatTime(new Date(Math.round(value / HOUR) * HOUR).toISOString())}`

function TimelineTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: TimelinePoint }> }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  const time = new Date(point.x).toISOString()
  if (!point.pair) return <div className="chart-tooltip"><strong>{formatDate(time)} · {formatTime(time)}</strong><span>No matched pair</span></div>
  return <div className="chart-tooltip"><strong>{formatDate(time)} · {formatTime(time)}</strong><span>Forecast <b>{formatMW(point.forecast)}</b></span><span>Hourly actual mean <b>{formatMW(point.actual)}</b></span><span>Error <b>{formatSigned(point.pair.error)}</b></span></div>
}

/** Hourly forecast vs actual across the filtered range, with a brush and range presets for zooming. */
export function ForecastTimeline({ pairs }: { pairs: AccuracyPair[] }) {
  const navigate = useNavigate()
  const crosshair = useCrosshair()
  const points = useMemo<TimelinePoint[]>(() => {
    const sorted = [...pairs].sort((a, b) => a.startTime.localeCompare(b.startTime))
    if (!sorted.length) return []
    const byTime = new Map(sorted.map((pair) => [Date.parse(pair.startTime), pair]))
    const hours = new Set(sorted.map((pair) => new Date(pair.startTime).getUTCHours()))
    const points: TimelinePoint[] = []
    // Walk every hour so excluded hours break the lines instead of being bridged.
    for (let x = Date.parse(sorted[0].startTime); x <= Date.parse(sorted[sorted.length - 1].startTime); x += HOUR) {
      if (!hours.has(new Date(x).getUTCHours())) continue
      const pair = byTime.get(x) ?? null
      points.push({ x, forecast: pair?.forecast ?? null, actual: pair?.actual ?? null, pair })
    }
    return points
  }, [pairs])
  const [zoom, setZoom] = useState<{ startIndex: number; endIndex: number } | null>(null)
  const last = points.length - 1
  const startIndex = Math.min(zoom?.startIndex ?? 0, last)
  const endIndex = Math.min(zoom?.endIndex ?? last, last)
  const spanHours = points.length ? (points[endIndex].x - points[startIndex].x) / HOUR + 1 : 0
  // Align ticks to midnight (or every 3 hours when zoomed to two days or less).
  const ticks = useMemo(() => {
    if (!points.length) return []
    const step = spanHours <= 48 ? 3 * HOUR : Math.max(1, Math.ceil(spanHours / 24 / 8)) * 24 * HOUR
    const from = Math.ceil(points[startIndex].x / step) * step
    const result: number[] = []
    for (let x = from; x <= points[endIndex].x; x += step) result.push(x)
    return result
  }, [points, startIndex, endIndex, spanHours])
  const activeRange = RANGES.find((range) => range.hours === Infinity ? startIndex === 0 && endIndex === last : Math.abs(spanHours - range.hours) < 1 && endIndex === last)?.label

  const showLast = (hours: number) => {
    if (hours === Infinity) { setZoom(null); return }
    const from = points[last].x - (hours - 1) * HOUR
    setZoom({ startIndex: Math.max(0, points.findIndex((point) => point.x >= from)), endIndex: last })
  }

  if (!points.length) return null
  return (
    <div className="chart-frame" aria-label="Hourly forecast and actual generation over the selected range">
      <div className="chart-legend">
        <span><i className="legend-line forecast" />Selected at cutoff</span>
        <span><i className="legend-line actual" />Hourly actual mean</span>
        <span className="range-buttons" role="group" aria-label="Zoom range">
          {RANGES.map((range) => <button key={range.label} type="button" aria-pressed={activeRange === range.label} onClick={() => showLast(range.hours)}>{range.label}</button>)}
        </span>
        <span className="chart-unit">Generation (MW) · drag the strip to zoom</span>
      </div>
      <ResponsiveContainer width="100%" height={330}>
        <ComposedChart data={points} margin={{ top: 16, right: 20, bottom: 4, left: 4 }} className="clickable-chart" {...crosshair.handlers}
          onClick={(state) => { const pair = (state?.activePayload?.[0]?.payload as TimelinePoint | undefined)?.pair; if (pair) navigate(`/decision-day?decisionDate=${pair.decisionDate}&deliveryStart=${encodeURIComponent(pair.startTime)}`) }}>
          <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tickFormatter={spanHours <= 48 ? (value) => formatTime(new Date(value).toISOString()) : dayTick} ticks={ticks} interval={0} tickLine={false} axisLine={false} tick={tick} />
          <YAxis tickFormatter={(value) => `${Number(value) / 1000}k`} tickLine={false} axisLine={false} width={48} tick={tick} />
          <Tooltip content={<TimelineTooltip />} cursor={false} />
          <Line type="linear" dataKey="actual" stroke="var(--actual)" strokeWidth={1.4} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="forecast" stroke="var(--forecast)" strokeWidth={1.8} dot={false} activeDot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
          <Customized component={<Crosshair pointerY={crosshair.pointerY} formatX={crossTick} formatY={formatNumber as (value: number) => string} />} />
          <Brush dataKey="x" height={34} travellerWidth={8} stroke="var(--line-strong)" fill="var(--surface)" startIndex={startIndex} endIndex={endIndex}
            tickFormatter={dayTick} onChange={(range) => { if (range.startIndex != null && range.endIndex != null) setZoom({ startIndex: range.startIndex, endIndex: range.endIndex }) }}>
            <ComposedChart data={points}>
              <Line type="linear" dataKey="actual" stroke="var(--line-strong)" strokeWidth={1} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </Brush>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
