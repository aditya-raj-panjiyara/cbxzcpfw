// Props Recharts injects into a <Customized> element (chart props + internal state).
interface Scale { (value: number): number; invert?: (value: number) => number }
interface InjectedProps {
  xAxisMap?: Record<string, { scale: Scale }>
  yAxisMap?: Record<string, { scale: Scale }>
  offset?: { left: number; top: number; width: number; height: number }
  activeCoordinate?: { x: number; y: number }
  isTooltipActive?: boolean
}

const firstScale = (map?: Record<string, { scale: Scale }>) => (map ? Object.values(map)[0]?.scale : undefined)

/** Trading-style crosshair: vertical line snaps to the active point, horizontal line follows the pointer. */
export function Crosshair({ pointerY, formatX, formatY, xAxisMap, yAxisMap, offset, activeCoordinate, isTooltipActive }: InjectedProps & {
  pointerY: number | null
  formatX: (value: number) => string
  formatY: (value: number) => string
}) {
  const x = firstScale(xAxisMap)
  const y = firstScale(yAxisMap)
  if (!x?.invert || !y?.invert || !offset || !isTooltipActive || !activeCoordinate) return null
  const px = activeCoordinate.x
  const bottom = offset.top + offset.height
  const showY = pointerY != null && pointerY >= offset.top && pointerY <= bottom
  const xLabel = formatX(x.invert(px))
  return (
    <g className="crosshair" pointerEvents="none">
      <line x1={px} x2={px} y1={offset.top} y2={bottom} />
      {showY && <>
        <line x1={offset.left} x2={offset.left + offset.width} y1={pointerY} y2={pointerY} />
        <rect x={0} y={pointerY - 9} width={offset.left - 2} height={18} rx={2} />
        <text x={offset.left - 6} y={pointerY + 4} textAnchor="end">{formatY(y.invert(pointerY))}</text>
      </>}
      <rect x={px - xLabel.length * 3.4 - 6} y={bottom + 2} width={xLabel.length * 6.8 + 12} height={18} rx={2} />
      <text x={px} y={bottom + 15} textAnchor="middle">{xLabel}</text>
    </g>
  )
}
