import { useLayoutEffect, useState, type CSSProperties } from 'react'
import { fitTag, playerLabel } from '../../game/format'
import { ROUTES_ENABLED, TSB2026_MAP } from '../../game/maps/tsb2026'
import type { BallPoint, Fumble, Pass, PlayResult, Route } from '../../game/playTracker'
import type { PlayerLookup } from '../../game/useGame'
import { teamColor } from './teamColors'

type Point = { x: number; y: number }

const UNIT = TSB2026_MAP.unitsPerYard
const GOAL_LOW = TSB2026_MAP.fieldZeroX
const GOAL_HIGH = GOAL_LOW + 100 * UNIT
const END_LOW = GOAL_LOW - 10 * UNIT
const END_HIGH = GOAL_HIGH + 10 * UNIT
export const SIDE_TOP = 0x10
export const SIDE_BOTTOM = 0xcf
const MID_Y = (SIDE_TOP + SIDE_BOTTOM) / 2
const ASPECT = 2
const PAD = 4 * UNIT
const MIN_ROUTE_YARDS = 2
const FLIGHT_GAP = 3 * UNIT
const JUMP = 2 * UNIT
const SKILL_SLOTS = new Set([1, 2, 3, 4, 5])
const DRAW_SECONDS = 2.5
const KICKS: readonly PlayResult['kind'][] = ['kickoff', 'punt']
const TRIES: readonly PlayResult['kind'][] = ['fieldGoal', 'extraPoint']
const SCALE = { card: 360, replay: 560 }
const LABEL_CHARS = 32
const CHAR_WIDTH = 0.62

export type ReplaySize = keyof typeof SCALE
export type Box = { x0: number; y0: number; x1: number; y1: number }
type View = { x: number; y: number; w: number; h: number }
export type Stroke = { kind: 'run' | 'flight' | 'kick'; team: 0 | 1; points: Point[]; part?: 'drop' | 'air' | 'yac' | 'recovery' }

const teamOf = (slot: number): 0 | 1 => (slot < 11 ? 0 : 1)
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const length = (points: Point[]) => points.reduce((sum, p, i) => (i === 0 ? 0 : sum + dist(points[i - 1], p)), 0)

function segments(ball: BallPoint[]): BallPoint[][] {
  const out: BallPoint[][] = []
  for (const point of ball) {
    const last = out[out.length - 1]
    if (last && last[last.length - 1].slot === point.slot) last.push(point)
    else out.push([point])
  }
  return out
}

export const passEnded = (pass: Pass | null): boolean => pass !== null && (pass.outcome === 'incomplete' || pass.outcome === 'deflected')

export function passEndLabel(pass: Pass, player?: PlayerLookup): string {
  if (pass.outcome === 'incomplete') return 'INC'
  const who = pass.by && player ? player(pass.by.team, pass.by.rosterIndex) : null
  if (!who || !who.last) return 'KNOCKED DOWN'
  return fitTag((fit) => `KNOCKED DOWN BY ${playerLabel(who, fit)}`, LABEL_CHARS)
}

export function fumbleLabel(fumble: Fumble, player?: PlayerLookup): string {
  if (!fumble.recovery) return 'FUMBLE, OUT OF BOUNDS'
  const by = fumble.recoveredBy
  const who = by && player ? player(by.team, by.rosterIndex) : null
  if (!who || !who.last) return 'FUMBLE RECOVERED'
  return fitTag((fit) => `RECOVERED BY ${playerLabel(who, fit)}`, LABEL_CHARS)
}

export function recoveryRun(play: PlayResult): { team: 0 | 1; points: Point[] } | null {
  const recovery = play.fumble?.recovery
  if (!play.fumble || !recovery || play.ball.length <= recovery.index) return null
  return { team: teamOf(recovery.slot), points: [play.fumble.at, ...play.ball.slice(recovery.index)] }
}

export const beforeFumble = (play: PlayResult): BallPoint[] => (play.fumble ? play.ball.slice(0, play.fumble.index + 1) : play.ball)

function nearestIndex(points: Point[], to: Point): number {
  let best = 0
  points.forEach((p, i) => {
    if (dist(p, to) < dist(points[best], to)) best = i
  })
  return best
}

export function crossing(from: Point, to: Point, x: number): Point | null {
  if ((from.x - x) * (to.x - x) >= 0) return null
  const t = (x - from.x) / (to.x - from.x)
  return { x, y: from.y + (to.y - from.y) * t }
}

function passStrokes(ball: BallPoint[], pass: Pass): Stroke[] | null {
  const [thrower, ...rest] = segments(ball)
  if (!thrower) return null
  const team = teamOf(thrower[0].slot)
  const drop = thrower.slice(0, nearestIndex(thrower, pass.from) + 1)
  const caught = pass.outcome === 'caught'
  const strokes: Stroke[] = [
    { kind: 'run', team, points: drop, ...(caught && { part: 'drop' as const }) },
    { kind: 'flight', team, points: [pass.from, pass.to], ...(caught && { part: 'air' as const }) },
  ]
  const next = rest[0]
  if (passEnded(pass) || !next) return strokes
  const after = scrimmageStrokes([{ ...pass.to, slot: next[0].slot }, ...rest.flat()])
  return [...strokes, ...after.map((s): Stroke => (caught && s.kind === 'run' && s.team === team ? { ...s, part: 'yac' } : s))]
}

function scrimmageStrokes(ball: BallPoint[]): Stroke[] {
  const strokes: Stroke[] = []
  for (const segment of segments(ball)) {
    const team = teamOf(segment[0].slot)
    const prev = strokes[strokes.length - 1]
    const end = prev?.points[prev.points.length - 1]
    if (prev && end && dist(end, segment[0]) > FLIGHT_GAP) strokes.push({ kind: 'flight', team, points: [end, segment[0]] })
    else if (prev && end) segment.unshift({ ...end, slot: segment[0].slot })
    strokes.push({ kind: 'run', team, points: segment })
  }
  return strokes
}

function kickStrokes(play: PlayResult): Stroke[] {
  const ball = play.ball
  if (ball.length === 0) return []
  const team = teamOf(ball[0].slot)
  const dir = team === 0 ? 1 : -1
  let catchAt = 0
  ball.forEach((p, i) => {
    if (p.x * dir < ball[catchAt].x * dir) catchAt = i
  })
  const from = { x: play.field.losX, y: MID_Y }
  return [
    { kind: 'kick', team: team === 0 ? 1 : 0, points: [from, ball[catchAt]] },
    { kind: 'run', team, points: ball.slice(catchAt) },
  ]
}

function tryStrokes(play: PlayResult): Stroke[] {
  const goal = play.field.attacksHigh ? END_HIGH : END_LOW
  return [{ kind: 'kick', team: play.offense, points: [{ x: play.field.losX, y: MID_Y }, { x: goal, y: MID_Y }] }]
}

export function playStrokes(play: PlayResult): Stroke[] {
  if (KICKS.includes(play.kind)) return kickStrokes(play)
  if (TRIES.includes(play.kind)) return tryStrokes(play)
  const ball = beforeFumble(play)
  const strokes = (play.pass && passStrokes(ball, play.pass)) || scrimmageStrokes(ball)
  const recovery = recoveryRun(play)
  return recovery ? [...strokes, { kind: 'run', team: recovery.team, points: recovery.points, part: 'recovery' }] : strokes
}

function progress(route: Route, dir: number) {
  const start = route.points[0]
  if (!start) return 0
  return route.points.reduce((best, p) => Math.max(best, ((p.x - start.x) * dir) / UNIT), 0)
}

export function routeLines(play: PlayResult, strokes: Stroke[]): Route[] {
  if (!play.thrown && !strokes.some((s) => s.kind === 'flight')) return []
  const dir = play.field.attacksHigh ? 1 : -1
  const carriers = new Set(play.ball.map((p) => p.slot - play.offense * 11))
  return play.routes.filter((r) => SKILL_SLOTS.has(r.slot) && !carriers.has(r.slot) && progress(r, dir) >= MIN_ROUTE_YARDS)
}

export function fieldWindow(play: PlayResult, strokes: Stroke[], routes: Route[], aspect = ASPECT): { x: number; y: number; w: number; h: number } {
  const xs = [play.field.losX, ...strokes.flatMap((s) => s.points.map((p) => p.x)), ...routes.flatMap((r) => r.points.map((p) => p.x))]
  if (play.field.toGainX !== null) xs.push(play.field.toGainX)
  const fieldH = SIDE_BOTTOM - SIDE_TOP
  const minW = fieldH * aspect
  let x0 = Math.min(...xs) - PAD
  let x1 = Math.max(...xs) + PAD
  if (x1 - x0 < minW) {
    const mid = (x0 + x1) / 2
    x0 = mid - minW / 2
    x1 = mid + minW / 2
  }
  const w = Math.min(x1 - x0, END_HIGH - END_LOW)
  x0 = Math.min(Math.max(x0, END_LOW), END_HIGH - w)
  const h = w / aspect
  return { x: x0, y: MID_Y - h / 2, w, h }
}

const path = (points: Point[]) =>
  points.map((p, i) => `${i === 0 || dist(points[i - 1], p) > JUMP ? 'M' : 'L'}${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join('')

function arc(from: Point, to: Point, lift: number) {
  const mx = (from.x + to.x) / 2
  const my = Math.min(from.y, to.y) - lift
  return `M${from.x},${from.y}Q${mx},${my} ${to.x},${to.y}`
}

const lerp = (a: Point, b: Point, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

function splitArc(from: Point, to: Point, lift: number, x: number): [string, string] | null {
  if (!crossing(from, to, x)) return null
  const t = (x - from.x) / (to.x - from.x)
  const c = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift }
  const a = lerp(from, c, t)
  const b = lerp(c, to, t)
  const m = lerp(a, b, t)
  const n = (v: number) => Math.round(v * 10) / 10
  return [`M${n(from.x)},${n(from.y)}Q${n(a.x)},${n(a.y)} ${n(m.x)},${n(m.y)}`, `M${n(m.x)},${n(m.y)}Q${n(b.x)},${n(b.y)} ${n(to.x)},${n(to.y)}`]
}

export function AirKey({ play }: { play: PlayResult }) {
  if (typeof play.airYards !== 'number' || typeof play.yac !== 'number') return null
  return (
    <div className="air-key" data-testid="air-key">
      <span className="air-key-row">
        <span className="air-swatch air-swatch-air" />
        {`AIR ${play.airYards} YDS`}
      </span>
      <span className="air-key-row">
        <span className="air-swatch air-swatch-yac" />
        {`YAC ${play.yac} YDS`}
      </span>
    </div>
  )
}

export function useAspect(): [(node: Element | null) => void, number] {
  const [node, setNode] = useState<Element | null>(null)
  const [aspect, setAspect] = useState(ASPECT)
  useLayoutEffect(() => {
    if (!node) return
    const update = () => {
      const { width, height } = node.getBoundingClientRect()
      if (width > 0 && height > 0) setAspect((prev) => (Math.abs(prev - width / height) > 0.01 ? width / height : prev))
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return [setNode, aspect]
}

function yardLabel(x: number): string {
  const yard = Math.round((x - GOAL_LOW) / UNIT)
  return String(yard <= 50 ? yard : 100 - yard)
}

function endLabel(play: PlayResult, strokes: Stroke[]): string {
  if (play.fumble?.lost && !play.touchdown) return ''
  if (play.touchdown) return 'TD'
  if (play.interception) return 'INT'
  if (strokes[strokes.length - 1].team !== play.offense && !KICKS.includes(play.kind)) return 'FUMBLE'
  if (play.thrown && play.yards === 0) return 'INC'
  if (KICKS.includes(play.kind) || TRIES.includes(play.kind)) return ''
  return play.yards > 0 ? `+${play.yards}` : String(play.yards)
}

type Numeral = { x: number; y: number; size: number; text: string; key: string }

function numerals(view: View, u: number): Numeral[] {
  const out: Numeral[] = []
  for (let yard = 10; yard < 100; yard += 10) {
    const x = GOAL_LOW + yard * UNIT
    if (x < view.x - UNIT || x > view.x + view.w + UNIT) continue
    out.push({ x, y: SIDE_TOP + 14 * u, size: 11 * u, text: yardLabel(x), key: `t${yard}` }, { x, y: SIDE_BOTTOM - 6 * u, size: 11 * u, text: yardLabel(x), key: `b${yard}` })
  }
  return out
}

export function textBox(x: number, y: number, text: string, size: number, pad = 0): Box {
  const half = (text.length * size * CHAR_WIDTH) / 2
  return { x0: x - half - pad, y0: y - size * 0.8 - pad, x1: x + half + pad, y1: y + size * 0.2 + pad }
}

export const numeralBoxes = (view: View, u: number): Box[] => numerals(view, u).map((n) => textBox(n.x, n.y, n.text, n.size, u))

export const dotBox = (at: Point, r: number): Box => ({ x0: at.x - r, y0: at.y - r, x1: at.x + r, y1: at.y + r })

export function Field({ view, abbrs, u }: { view: View; abbrs: [string, string]; u: number }) {
  const lines = numerals(view, u).map((n) => (
    <text key={n.key} className="field-num" x={n.x} y={n.y} fontSize={n.size} textAnchor="middle">
      {n.text}
    </text>
  ))
  for (let yard = -10; yard <= 110; yard += 5) {
    const x = GOAL_LOW + yard * UNIT
    if (x < view.x - UNIT || x > view.x + view.w + UNIT) continue
    const goal = yard === 0 || yard === 100
    if (yard >= 0 && yard <= 100) lines.push(<line key={`l${yard}`} className="field-line" x1={x} x2={x} y1={SIDE_TOP} y2={SIDE_BOTTOM} strokeWidth={(goal ? 2.5 : 1.2) * u} />)
  }
  const hashes = []
  for (let yard = 1; yard < 100; yard++) {
    if (yard % 5 === 0) continue
    const x = GOAL_LOW + yard * UNIT
    if (x < view.x || x > view.x + view.w) continue
    for (const y of [SIDE_TOP + (SIDE_BOTTOM - SIDE_TOP) / 3, SIDE_TOP + ((SIDE_BOTTOM - SIDE_TOP) * 2) / 3]) {
      hashes.push(<line key={`h${yard}-${y}`} className="field-line" x1={x} x2={x} y1={y - 2 * u} y2={y + 2 * u} strokeWidth={u} />)
    }
  }
  const zone = (side: 0 | 1) => {
    const x = side === 0 ? END_LOW : GOAL_HIGH
    const colors = teamColor(abbrs[side])
    const cx = x + 5 * UNIT
    return (
      <g key={`z${side}`}>
        <rect x={x} y={SIDE_TOP} width={10 * UNIT} height={SIDE_BOTTOM - SIDE_TOP} fill={colors.primary} />
        <text className="field-zone" x={cx} y={MID_Y} fontSize={16 * u} textAnchor="middle" dominantBaseline="central" transform={`rotate(${side === 0 ? -90 : 90} ${cx} ${MID_Y})`}>
          {abbrs[side]}
        </text>
      </g>
    )
  }
  return (
    <>
      <rect className="field-stands" x={view.x} y={view.y} width={view.w} height={view.h} />
      <rect className="field-grass" x={END_LOW} y={SIDE_TOP} width={END_HIGH - END_LOW} height={SIDE_BOTTOM - SIDE_TOP} />
      {zone(0)}
      {zone(1)}
      {lines}
      {hashes}
    </>
  )
}

const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi))

const nearest = (box: Box, at: Point): Point => ({ x: Math.min(Math.max(at.x, box.x0), box.x1), y: Math.min(Math.max(at.y, box.y0), box.y1) })

export function placeLabel(at: Point, label: string, u: number, view: View, avoid: Box[]): { x: number; y: number; size: number; plate: Box; leader: Point | null } {
  const size = 14 * u
  const pad = 2 * u
  const gap = 11 * u
  const half = (label.length * size * CHAR_WIDTH) / 2
  const mark = dotBox(at, 7 * u)
  const spots: [number, number][] = [
    [at.x, at.y - gap],
    [at.x, at.y + gap + size * 0.8],
    [at.x - half - gap, at.y + size * 0.3],
    [at.x + half + gap, at.y + size * 0.3],
  ]
  for (let y = view.y; y <= view.y + view.h + size; y += size / 2) for (const dx of [0, -half, half, -2 * half, 2 * half]) spots.push([at.x + dx, y])
  let best: { x: number; y: number; plate: Box; cost: number; reach: number } | null = null
  for (const [sx, sy] of spots) {
    const x = clamp(sx, view.x + half + pad + u, view.x + view.w - half - pad - u)
    const y = clamp(sy, view.y + size * 0.8 + pad + u, view.y + view.h - size * 0.2 - pad - u)
    const plate = textBox(x, y, label, size, pad)
    const cost = [mark, ...avoid].reduce((sum, b) => sum + area(plate, b), 0)
    const reach = dist(nearest(plate, at), at)
    if (!best || cost < best.cost || (cost === best.cost && reach < best.reach)) best = { x, y, plate, cost, reach }
    if (cost === 0 && reach <= gap) break
  }
  const { x, y, plate, reach } = best!
  return { x, y, size, plate, leader: reach > size * 3 ? nearest(plate, at) : null }
}

function MarkLabel({ at, label, u, view, testId, avoid = [] }: { at: Point; label: string; u: number; view: View; testId: string; avoid?: Box[] }) {
  if (!label) return null
  const { x, y, size, plate, leader } = placeLabel(at, label, u, view, avoid)
  return (
    <>
      {leader && <line data-testid={`${testId}-leader`} className="label-leader" x1={at.x} y1={at.y} x2={leader.x} y2={leader.y} strokeWidth={1.6 * u} strokeDasharray={`${3 * u} ${2 * u}`} />}
      <rect data-testid={`${testId}-plate`} className="label-plate" x={plate.x0} y={plate.y0} width={plate.x1 - plate.x0} height={plate.y1 - plate.y0} rx={2 * u} strokeWidth={0.6 * u} />
      <text data-testid={testId} className="pass-label" x={x} y={y} fontSize={size} style={{ strokeWidth: 1.5 * u }} textAnchor="middle">
        {label}
      </text>
    </>
  )
}

export function PassMark({ at, label, u, view, avoid }: { at: Point; label: string; u: number; view: View; avoid?: Box[] }) {
  const arm = 5 * u
  return (
    <>
      <path data-testid="pass-x" className="pass-x" d={`M${at.x - arm},${at.y - arm}L${at.x + arm},${at.y + arm}M${at.x - arm},${at.y + arm}L${at.x + arm},${at.y - arm}`} strokeWidth={2.5 * u} />
      <MarkLabel at={at} label={label} u={u} view={view} testId="pass-end" avoid={avoid} />
    </>
  )
}

const BURST_POINTS = 8

function burst(at: Point, outer: number, inner: number) {
  const n = (v: number) => Math.round(v * 10) / 10
  const points = Array.from({ length: BURST_POINTS * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI * i) / BURST_POINTS
    return `${n(at.x + r * Math.sin(a))},${n(at.y - r * Math.cos(a))}`
  })
  return `M${points.join('L')}Z`
}

export function FumbleMark({ at, label, u, view, avoid }: { at: Point; label: string; u: number; view: View; avoid?: Box[] }) {
  return (
    <>
      <path data-testid="fumble-burst" className="fumble-burst" d={burst(at, 7 * u, 3.2 * u)} strokeWidth={1.2 * u} />
      <MarkLabel at={at} label={label} u={u} view={view} testId="fumble-label" avoid={avoid} />
    </>
  )
}

function endSpot(at: Point, label: string, u: number, view: View, avoid: Box[]): Point {
  const size = 16 * u
  const half = (label.length * size * CHAR_WIDTH) / 2
  const spots: [number, number][] = [
    [at.x, at.y - 10 * u],
    [at.x, at.y + 10 * u + size * 0.8],
    [at.x - half - 8 * u, at.y + size * 0.3],
    [at.x + half + 8 * u, at.y + size * 0.3],
  ]
  const dot = dotBox(at, 5 * u)
  let best: { x: number; y: number; cost: number } | null = null
  for (const [sx, sy] of spots) {
    const x = clamp(sx, view.x + half + 2 * u, view.x + view.w - half - 2 * u)
    const y = clamp(sy, view.y + size * 0.8 + 2 * u, view.y + view.h - size * 0.2 - 2 * u)
    const box = textBox(x, y, label, size, u)
    const cost = [dot, ...avoid].reduce((sum, b) => sum + area(box, b), 0)
    if (!best || cost < best.cost) best = { x, y, cost }
    if (cost === 0) break
  }
  return { x: best!.x, y: best!.y }
}

function endBoxes(at: Point, label: string, u: number, view: View, avoid: Box[]): Box[] {
  const spot = endSpot(at, label, u, view, avoid)
  return [dotBox(at, 5 * u), textBox(spot.x, spot.y, label, 16 * u, u)]
}

function EndMark({ at, label, u, view, avoid, dot = true }: { at: Point; label: string; u: number; view: View; avoid: Box[]; dot?: boolean }) {
  const spot = label ? endSpot(at, label, u, view, avoid) : null
  return (
    <>
      {dot && <circle cx={at.x} cy={at.y} r={5 * u} />}
      {spot && (
        <text className="route-end-label" x={spot.x} y={spot.y} fontSize={16 * u} textAnchor="middle">
          {label}
        </text>
      )}
    </>
  )
}

type Props = { play: PlayResult | null; abbrs: [string, string]; size?: ReplaySize; player?: PlayerLookup; rate?: number }

export default function RouteReplay({ play, abbrs, size = 'card', player, rate = 1 }: Props) {
  const [measure, aspect] = useAspect()
  if (!ROUTES_ENABLED || !play) return null
  const strokes = playStrokes(play)
  if (strokes.length === 0) return null
  const routes = routeLines(play, strokes)
  const view = fieldWindow(play, strokes, routes, aspect)
  const u = view.w / SCALE[size]
  const total = strokes.reduce((sum, s) => sum + length(s.points), 0) || 1
  const draw = DRAW_SECONDS / rate
  let elapsed = 0
  const timed = strokes.map((stroke) => {
    const len = length(stroke.points)
    const delay = (elapsed / total) * draw
    const duration = Math.max(0.15, (len / total) * draw)
    elapsed += len
    return { stroke, len, delay, duration }
  })
  const last = strokes[strokes.length - 1].points.at(-1)
  const label = endLabel(play, strokes)
  const numbers = numeralBoxes(view, u)
  return (
    <>
      <svg ref={measure} className={`route-replay route-replay-${size}`} data-testid="route-replay" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid slice">
        <Field view={view} abbrs={abbrs} u={u} />
        <line className="field-los" x1={play.field.losX} x2={play.field.losX} y1={SIDE_TOP} y2={SIDE_BOTTOM} strokeWidth={2.5 * u} />
        {play.field.toGainX !== null && !KICKS.includes(play.kind) && (
          <line className="field-gain" x1={play.field.toGainX} x2={play.field.toGainX} y1={SIDE_TOP} y2={SIDE_BOTTOM} strokeWidth={2.5 * u} />
        )}
        {routes.map((route) => (
          <path key={`r${route.slot}`} className="route-other" d={path(route.points)} fill="none" strokeWidth={2 * u} />
        ))}
        {timed.map(({ stroke, len, delay, duration }, i) => {
          const style = { '--route-length': len, '--route-delay': `${delay}s`, '--route-duration': `${duration}s` } as CSSProperties
          if (stroke.part === 'recovery') {
            const color = teamColor(abbrs[stroke.team])
            const d = path(stroke.points)
            return (
              <g key={i} style={style}>
                <path className="route-recovery" d={d} fill="none" stroke={color.secondary} strokeWidth={7 * u} />
                <path data-testid="fumble-recovery" className="route-recovery" d={d} fill="none" stroke={color.primary} strokeWidth={4.5 * u} />
              </g>
            )
          }
          if (stroke.kind === 'run') {
            const own = stroke.team === play.offense
            return (
              <path
                key={i}
                data-testid="ball-path"
                className={stroke.part === 'drop' ? 'route-carrier route-neutral' : stroke.part === 'yac' ? 'route-carrier route-yac' : own ? 'route-carrier' : 'route-carrier route-turnover'}
                d={path(stroke.points)}
                fill="none"
                strokeWidth={4.5 * u}
                style={style}
              />
            )
          }
          const [from, to] = stroke.points
          const lift = stroke.kind === 'kick' ? Math.min(60, dist(from, to) / 4) : dist(from, to) / 8
          if (stroke.part === 'air') {
            const split = splitArc(from, to, lift, play.field.losX)
            const dash = `${6 * u} ${4 * u}`
            return (
              <g key={i}>
                {split && <path data-testid="ball-flight" className="route-flight route-neutral" d={split[0]} fill="none" strokeWidth={2.5 * u} strokeDasharray={dash} style={style} />}
                <path data-testid="ball-air" className="route-flight route-air" d={split ? split[1] : arc(from, to, lift)} fill="none" strokeWidth={2.5 * u} strokeDasharray={dash} style={style} />
              </g>
            )
          }
          return (
            <path
              key={i}
              data-testid={stroke.kind === 'flight' ? 'ball-flight' : 'ball-kick'}
              className="route-flight"
              d={arc(from, to, lift)}
              fill="none"
              strokeWidth={2.5 * u}
              strokeDasharray={`${6 * u} ${4 * u}`}
              style={style}
            />
          )
        })}
        {play.fumble ? (
          <g className="route-end" style={{ '--route-delay': `${draw}s` } as CSSProperties}>
            <FumbleMark at={play.fumble.at} label={fumbleLabel(play.fumble, player)} u={u} view={view} avoid={[...numbers, ...(last && label ? endBoxes(last, label, u, view, numbers) : [])]} />
            {last && (label || play.fumble.recovery) && <EndMark at={last} label={label} u={u} view={view} avoid={numbers} dot={!!play.fumble.recovery} />}
          </g>
        ) : play.pass && passEnded(play.pass) ? (
          <g className="route-end" style={{ '--route-delay': `${draw}s` } as CSSProperties}>
            <PassMark at={play.pass.to} label={passEndLabel(play.pass, player)} u={u} view={view} avoid={numbers} />
          </g>
        ) : last && (
          <g className="route-end" style={{ '--route-delay': `${draw}s` } as CSSProperties}>
            <EndMark at={last} label={label} u={u} view={view} avoid={numbers} />
          </g>
        )}
      </svg>
      <AirKey play={play} />
    </>
  )
}
