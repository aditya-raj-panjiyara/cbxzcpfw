import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { formatDate, formatMW, formatSigned, formatTime } from '@/lib/format'
import type { AccuracyPair } from '@/types/wind'

interface ErrorHeatmapProps {
  pairs: AccuracyPair[]
  decisionFrom: string
  decisionTo: string
  deliveryFrom?: string | null
  deliveryTo?: string | null
  fromTime?: string | null
  toTime?: string | null
}

const DAY_MS = 86_400_000

function addDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0
  const index = (sorted.length - 1) * q
  const low = Math.floor(index)
  const high = Math.ceil(index)
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low)
}

function cellColor(error: number, scale: number) {
  const strength = Math.round(12 + 88 * Math.min(1, Math.abs(error) / scale))
  return `color-mix(in srgb, var(${error >= 0 ? '--overforecast' : '--underforecast'}) ${strength}%, var(--surface))`
}

export function ErrorHeatmap({ pairs, decisionFrom, decisionTo, deliveryFrom, deliveryTo, fromTime, toTime }: ErrorHeatmapProps) {
  const [hovered, setHovered] = useState<AccuracyPair | null>(null)
  const [selected, setSelected] = useState<AccuracyPair | null>(null)
  const [selectedFor, setSelectedFor] = useState(pairs)
  if (selectedFor !== pairs) {
    setSelectedFor(pairs)
    setSelected(null)
  }

  const { days, hours, cells, scale } = useMemo(() => {
    // Rows are every delivery day in the requested range, so excluded hours stay visible as gaps.
    let first = addDays(decisionFrom, 1)
    let last = addDays(decisionTo, 1)
    if (deliveryFrom && deliveryFrom > first) first = deliveryFrom
    if (deliveryTo && deliveryTo < last) last = deliveryTo
    const days: string[] = []
    for (let day = first; day <= last; day = addDays(day, 1)) days.push(day)
    const hours = Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => {
      const label = `${String(hour).padStart(2, '0')}:00`
      return (!fromTime || label >= fromTime) && (!toTime || label <= toTime)
    })
    const cells = new Map(pairs.map((pair) => [`${pair.deliveryDate}|${new Date(pair.startTime).getUTCHours()}`, pair]))
    const scale = quantile(pairs.map((pair) => Math.abs(pair.error)).sort((a, b) => a - b), 0.95) || 1
    return { days, hours, cells, scale }
  }, [pairs, decisionFrom, decisionTo, deliveryFrom, deliveryTo, fromTime, toTime])

  return (
    <div className="chart-frame heatmap-frame" aria-label="Signed forecast error by delivery day and hour">
      <div className="chart-legend">
        <span className="heatmap-scale"><small>{formatSigned(-scale)}</small><i className="heatmap-gradient" /><small>{formatSigned(scale)}</small></span>
        <span><i className="legend-box missing" />No matched pair</span>
        <span className="chart-unit">Delivery day × hour (GMT)</span>
      </div>
      <div className="heatmap" style={{ gridTemplateColumns: `52px repeat(${hours.length}, minmax(0, 1fr))` }} onMouseLeave={() => setHovered(null)}>
        <span />
        {hours.map((hour) => <span key={hour} className="heatmap-hour">{hour % 3 === 0 || hours.length <= 8 ? String(hour).padStart(2, '0') : ''}</span>)}
        {days.map((day) => <div key={day} className="heatmap-row">
          <span className="heatmap-day">{formatDate(day, { day: '2-digit', month: 'short', timeZone: 'UTC' })}</span>
          {hours.map((hour) => {
            const pair = cells.get(`${day}|${hour}`)
            if (!pair) return <span key={hour} className="heatmap-cell missing" title={`${formatDate(day)} · ${String(hour).padStart(2, '0')}:00 · no matched pair`} />
            return <button key={hour} type="button" tabIndex={-1} className={`heatmap-cell${selected === pair ? ' selected' : ''}`} style={{ background: cellColor(pair.error, scale) }}
              aria-label={`${formatDate(day)} ${String(hour).padStart(2, '0')}:00, error ${formatSigned(pair.error)}`} aria-pressed={selected === pair}
              onMouseEnter={() => setHovered(pair)} onFocus={() => setHovered(pair)} onClick={() => setSelected(selected === pair ? null : pair)} />
          })}
        </div>)}
      </div>
      <p className="heatmap-readout" aria-live="polite">
        {hovered
          ? <><strong>{formatDate(hovered.startTime)} · {new Date(hovered.startTime).toISOString().slice(11, 16)}</strong><span>Forecast {formatMW(hovered.forecast)}</span><span>Actual mean {formatMW(hovered.actual)}</span><span className={hovered.error >= 0 ? 'error-positive' : 'error-negative'}>{hovered.error >= 0 ? 'Over' : 'Under'} {formatSigned(hovered.error)}</span></>
          : <span>Hover a cell to read it; click to pin it without leaving this page. Colour is capped at the 95th percentile of |error|.</span>}
      </p>
      {selected && <div className="heatmap-detail">
        <div className="heatmap-fact"><span>Delivery hour</span><b>{formatDate(selected.startTime)} · {formatTime(selected.startTime)}</b></div>
        <div className="heatmap-fact"><span>Decision date</span><b>{formatDate(selected.decisionDate)}</b></div>
        <div className="heatmap-fact"><span>Forecast</span><b>{formatMW(selected.forecast)}</b></div>
        <div className="heatmap-fact"><span>Actual mean</span><b>{formatMW(selected.actual)}</b></div>
        <div className="heatmap-fact"><span>Error</span><b className={selected.error >= 0 ? 'error-positive' : 'error-negative'}>{formatSigned(selected.error)}</b></div>
        <Link className="text-link" to={`/decision-day?decisionDate=${selected.decisionDate}&deliveryStart=${encodeURIComponent(selected.startTime)}`}>Open this decision<ArrowRight size={14} /></Link>
      </div>}
    </div>
  )
}
