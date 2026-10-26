import { useState } from 'react'

/** Tracks the pointer's y position inside a Recharts chart for the Crosshair layer. */
export function useCrosshair() {
  const [pointerY, setPointerY] = useState<number | null>(null)
  return {
    pointerY,
    handlers: {
      onMouseMove: (state: { chartY?: number } | null) => setPointerY(state?.chartY ?? null),
      onMouseLeave: () => setPointerY(null),
    },
  }
}
