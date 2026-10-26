import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDateTime, formatMW, formatSigned } from '@/lib/format'
import type { Revision } from '@/types/wind'

interface RevisionChartProps {
  revisions: Revision[]
  cutoff: string
  actual: number | null
}

type Point = Revision & { x: number; trailing?: boolean }

const tick = { fill: 'var(--muted)', fontSize: 10, fontFamily: 'IBM Plex Mono' }
const shortTime = (value: number) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(value)

function RevisionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Point }> }) {
  const point = payload?.[0]?.payload
  if (!active || !point || point.trailing) return null
  return <div className="chart-tooltip"><strong>{formatDateTime(point.publishTime)}</strong><span>Forecast <b>{formatMW(point.generation)}</b></span><span>Change <b>{formatSigned(point.change)}</b></span><span>{point.selected ? 'Selected' : point.eligible ? 'Before cutoff' : 'After cutoff'}</span></div>
}

function RevisionDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Point }) {
  if (cx == null || cy == null || !payload || payload.trailing) return null
  if (payload.selected) return <circle cx={cx} cy={cy} r={5} fill="var(--accent)" stroke="var(--ink-strong)" strokeWidth={1.5} />
  return <circle cx={cx} cy={cy} r={2.5} fill={payload.eligible ? 'var(--forecast)' : 'var(--line-strong)'} />
}

export function RevisionChart({ revisions, cutoff, actual }: RevisionChartProps) {
  const points: Point[] = [...revisions].map((revision) => ({ ...revision, x: Date.parse(revision.publishTime) })).sort((a, b) => a.x - b.x)
  const cutoffX = Date.parse(cutoff)
  const minX = Math.min(points[0].x, cutoffX)
  const lastX = Math.max(points[points.length - 1].x, cutoffX)
  // Pad the right edge so the latest version's step is visible rather than ending on the axis.
  const maxX = lastX + Math.max(3_600_000, (lastX - minX) * 0.08)
  const data = [...points, { ...points[points.length - 1], x: maxX, trailing: true }]

  return (
    <div className="revision-chart" aria-label="Forecast versions by publish time">
      <div className="chart-legend">
        <span><i className="legend-dot selected" />Selected</span>
        <span><i className="legend-box after-cutoff" />After cutoff</span>
        {actual != null && <span><i className="legend-line actual-ref" />Actual</span>}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 14, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey="x" type="number" scale="time" domain={[minX, maxX]} tickFormatter={shortTime} tickCount={5} tickLine={false} axisLine={false} tick={tick} />
          <YAxis domain={['auto', 'auto']} tickFormatter={(value) => `${(Number(value) / 1000).toFixed(1)}k`} tickLine={false} axisLine={false} width={40} tick={tick} />
          {maxX > cutoffX && <ReferenceArea x1={cutoffX} x2={maxX} fill="var(--surface-subtle)" fillOpacity={0.9} />}
          <ReferenceLine x={cutoffX} stroke="var(--ink)" strokeDasharray="3 3" label={{ value: 'Cutoff', position: 'insideTopLeft', fill: 'var(--muted)', fontSize: 10 }} />
          {actual != null && <ReferenceLine y={actual} stroke="var(--actual)" strokeDasharray="5 4" ifOverflow="extendDomain" />}
          <Tooltip content={<RevisionTooltip />} />
          <Line type="stepAfter" dataKey="generation" stroke="var(--forecast)" strokeWidth={1.8} dot={<RevisionDot />} activeDot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
