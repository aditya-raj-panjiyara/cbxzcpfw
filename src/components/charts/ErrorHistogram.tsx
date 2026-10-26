import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNumber, formatSigned } from '@/lib/format'

interface ErrorHistogramProps {
  errors: number[]
  bias: number | null
  p05: number | null
  p95: number | null
}

interface Bin { from: number; to: number; mid: number; count: number }

const STEPS = [100, 200, 250, 500, 1000, 2000, 2500, 5000]
const mwTick = (value: number) => Math.abs(value) >= 1000 ? `${value / 1000}k` : String(value)
const tick = { fill: 'var(--muted)', fontSize: 10, fontFamily: 'IBM Plex Mono' }

function BinTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Bin }> }) {
  const bin = payload?.[0]?.payload
  if (!active || !bin) return null
  return <div className="chart-tooltip"><strong>{formatSigned(bin.from)} to {formatSigned(bin.to)}</strong><span>Hours <b>{formatNumber(bin.count)}</b></span></div>
}

export function ErrorHistogram({ errors, bias, p05, p95 }: ErrorHistogramProps) {
  const { bins, width } = useMemo(() => {
    const min = Math.min(...errors)
    const max = Math.max(...errors)
    const width = STEPS.find((step) => (max - min) / step <= 28) ?? STEPS[STEPS.length - 1]
    const start = Math.floor(Math.min(min, 0) / width) * width
    const end = (Math.floor(Math.max(max, 0) / width) + 1) * width
    const bins: Bin[] = []
    for (let from = start; from < end; from += width) bins.push({ from, to: from + width, mid: from + width / 2, count: 0 })
    errors.forEach((error) => { bins[Math.floor((error - start) / width)].count += 1 })
    return { bins, width }
  }, [errors])

  return (
    <div className="chart-frame" aria-label="Distribution of signed forecast errors">
      <div className="chart-legend">
        <span><i className="legend-box over" />Overforecast (+)</span>
        <span><i className="legend-box under" />Underforecast (−)</span>
        <span><i className="legend-line bias" />Bias</span>
        {p05 != null && <span><i className="legend-line range" />p05 / p95</span>}
        <span className="chart-unit">Hours per {formatNumber(width)} MW bin</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={bins} margin={{ top: 16, right: 20, bottom: 4, left: 4 }} barCategoryGap={1}>
          <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey="mid" type="number" domain={[bins[0].from, bins[bins.length - 1].to]} tickFormatter={mwTick} tickLine={false} axisLine={false} tick={tick} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={tick} />
          <Tooltip content={<BinTooltip />} cursor={{ fill: 'var(--surface-subtle)' }} />
          <Bar dataKey="count" isAnimationActive={false}>{bins.map((bin) => <Cell key={bin.from} fill={bin.mid >= 0 ? 'var(--overforecast)' : 'var(--underforecast)'} />)}</Bar>
          <ReferenceLine x={0} stroke="var(--ink)" />
          {p05 != null && <ReferenceLine x={p05} stroke="var(--ink)" strokeDasharray="3 3" label={{ value: 'p05', position: 'top', fill: 'var(--muted)', fontSize: 10 }} />}
          {p95 != null && <ReferenceLine x={p95} stroke="var(--ink)" strokeDasharray="3 3" label={{ value: 'p95', position: 'top', fill: 'var(--muted)', fontSize: 10 }} />}
          {bias != null && <ReferenceLine x={bias} stroke="var(--forecast)" strokeWidth={2} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
