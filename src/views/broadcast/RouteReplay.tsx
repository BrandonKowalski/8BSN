import type { CSSProperties } from 'react'
import { ROUTES_ENABLED, TSB2026_MAP } from '../../game/maps/tsb2026'
import type { PlayResult, Route } from '../../game/playTracker'

const SPAN_YARDS = 40
const MIN_YARDS = 2
const Y_MIN = 0x19
const Y_MAX = 0xc6
const Y_UNITS_PER_YARD = (Y_MAX - Y_MIN) / (160 / 3)
const BOX = { w: 200, h: 100 }
const CARRIER = '#ffe600'
const OTHER = '#55ccff'

type Box = { w: number; h: number }
type Point = { x: number; y: number }

const unitsPerYard = TSB2026_MAP.unitsPerYard

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const direction = (offense: 0 | 1) => (offense === 0 ? 1 : -1)

const round = (n: number) => String(Math.round(n * 100) / 100)

function lineOfScrimmage(routes: Route[]) {
  const starts = routes.filter((r) => r.points.length > 0).map((r) => r.points[0].x)
  return starts.length > 0 ? median(starts) : 0
}

function yardsMoved(route: Route) {
  const start = route.points[0]
  if (!start) return 0
  return route.points.reduce((best, p) => {
    const dx = (p.x - start.x) / unitsPerYard
    const dy = (p.y - start.y) / Y_UNITS_PER_YARD
    return Math.max(best, Math.hypot(dx, dy))
  }, 0)
}

export function ballCarrierSlot(routes: Route[], offense: 0 | 1): number | null {
  let best: number | null = null
  let bestX = -Infinity
  for (const route of routes) {
    const end = route.points[route.points.length - 1]
    if (!end) continue
    const downfield = end.x * direction(offense)
    if (downfield > bestX) {
      bestX = downfield
      best = route.slot
    }
  }
  return best
}

export function routePaths(routes: Route[], box: Box, offense: 0 | 1 = 0): { slot: number; d: string; length: number }[] {
  const los = lineOfScrimmage(routes)
  const dir = direction(offense)
  const project = (p: Point): Point => ({
    x: box.w / 2 + (((p.x - los) / unitsPerYard) * dir * box.w) / SPAN_YARDS,
    y: (Math.min(Math.max(p.y, Y_MIN), Y_MAX) - Y_MIN) * (box.h / (Y_MAX - Y_MIN)),
  })
  return routes
    .filter((r) => yardsMoved(r) >= MIN_YARDS)
    .map((r) => {
      const points = r.points.map(project)
      let length = 0
      for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`).join('')
      return { slot: r.slot, d, length }
    })
}

export default function RouteReplay({ play }: { play: PlayResult | null }) {
  if (!ROUTES_ENABLED || !play) return null
  const paths = routePaths(play.routes, BOX, play.offense)
  if (paths.length === 0) return null
  const carrier = ballCarrierSlot(play.routes, play.offense)
  return (
    <svg className="route-replay" data-testid="route-replay" viewBox={`0 0 ${BOX.w} ${BOX.h}`}>
      <line className="route-los" x1={BOX.w / 2} x2={BOX.w / 2} y1={0} y2={BOX.h} />
      {paths.map((path) => (
        <path
          key={path.slot}
          className="route-line"
          d={path.d}
          fill="none"
          stroke={path.slot === carrier ? CARRIER : OTHER}
          style={{ '--route-length': path.length } as CSSProperties}
        />
      ))}
    </svg>
  )
}
