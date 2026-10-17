import type { CSSProperties } from 'react'
import { ROUTES_ENABLED, TSB2026_MAP } from '../../game/maps/tsb2026'
import type { PlayResult, Route } from '../../game/playTracker'

const MIN_YARDS = 2
const Y_MIN = 0x19
const Y_MAX = 0xc6
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

function progress(route: Route, dir: number) {
  const start = route.points[0]
  if (!start) return 0
  return route.points.reduce((best, p) => Math.max(best, ((p.x - start.x) * dir) / unitsPerYard), 0)
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

type RoutePath = { slot: number; d: string; length: number }

function layout(routes: Route[], box: Box, offense: 0 | 1): { paths: RoutePath[]; losX: number } {
  const los = lineOfScrimmage(routes)
  const dir = direction(offense)
  const kept = routes.filter((r) => progress(r, dir) >= MIN_YARDS)
  const downfield = kept.flatMap((r) => r.points.map((p) => ((p.x - los) * dir) / unitsPerYard))
  const forward = Math.max(0, ...downfield)
  const backward = Math.max(0, ...downfield.map((v) => -v))
  const baseYards = (Y_MAX - Y_MIN) / unitsPerYard
  const width = Math.max((box.w * baseYards) / box.h, forward + backward)
  const scale = box.w / width
  const losYards = Math.min(Math.max(width / 3, backward), width - forward)
  const midY = (Y_MIN + Y_MAX) / 2
  const project = (p: Point): Point => ({
    x: (losYards + ((p.x - los) * dir) / unitsPerYard) * scale,
    y: box.h / 2 + ((Math.min(Math.max(p.y, Y_MIN), Y_MAX) - midY) / unitsPerYard) * scale,
  })
  const paths = kept.map((r) => {
    const points = r.points.map(project)
    let length = 0
    for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`).join('')
    return { slot: r.slot, d, length }
  })
  return { paths, losX: losYards * scale }
}

export function routePaths(routes: Route[], box: Box, offense: 0 | 1 = 0): RoutePath[] {
  return layout(routes, box, offense).paths
}

export default function RouteReplay({ play }: { play: PlayResult | null }) {
  if (!ROUTES_ENABLED || !play) return null
  const { paths, losX } = layout(play.routes, BOX, play.offense)
  if (paths.length === 0) return null
  const carrier = ballCarrierSlot(play.routes, play.offense)
  return (
    <svg className="route-replay" data-testid="route-replay" viewBox={`0 0 ${BOX.w} ${BOX.h}`}>
      <line className="route-los" x1={losX} x2={losX} y1={0} y2={BOX.h} />
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
