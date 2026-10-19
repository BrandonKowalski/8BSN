import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { BallPoint, PlayResult, Route } from '../../game/playTracker'
import { TSB2026_MAP } from '../../game/maps/tsb2026'
import RouteReplay, { fieldWindow, playStrokes, routeLines } from './RouteReplay'
import { teamColor } from './teamColors'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const LOS = 0x800
const line = (slot: number, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10): BallPoint[] =>
  Array.from({ length: steps + 1 }, (_, i) => ({ slot, x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }))
const route = (slot: number, yards: number, y: number): Route => ({ slot, points: Array.from({ length: yards + 1 }, (_, i) => ({ x: LOS + i * 8, y })) })

const play = (overrides: Partial<PlayResult> = {}): PlayResult => ({
  index: 4,
  offense: 0,
  quarter: 1,
  yards: 22,
  touchdown: false,
  sack: false,
  interception: false,
  kicked: false,
  thrown: false,
  call: null,
  scramble: false,
  kind: 'scrimmage',
  isTry: false,
  routes: [],
  ball: [],
  field: { losX: LOS, toGainX: LOS + 80, attacksHigh: true },
  summary: '',
  startFrame: 0,
  endFrame: 0,
  down: 1,
  toGo: 10,
  startBallOn: { yard: 25, side: 0 },
  scoreBefore: [0, 0],
  scoreAfter: [0, 0],
  tracks: { frames: [], players: [] },
  people: {},
  pass: null,
  airYards: null,
  yac: null,
  fumble: null,
  kickResult: null,
  returner: null,
  returnYards: null,
  ...overrides,
})

const pass = () =>
  play({
    ball: [...line(0, { x: LOS - 8, y: 100 }, { x: LOS - 40, y: 100 }), ...line(3, { x: LOS + 120, y: 60 }, { x: LOS + 176, y: 50 })],
    routes: [route(0, 0, 100), route(3, 22, 60), route(4, 12, 140), route(7, 0, 110)],
  })

test('a completed pass draws the QB drop, the ball in flight and the catch and run', () => {
  const strokes = playStrokes(pass())
  expect(strokes.map((s) => s.kind)).toEqual(['run', 'flight', 'run'])
  expect(strokes[1].points[0]).toEqual(strokes[0].points.at(-1))
  expect(strokes[1].points[1]).toMatchObject({ x: LOS + 120, y: 60 })
})

test('a pass shows the other routes faintly but not the carriers or linemen', () => {
  const p = pass()
  expect(routeLines(p, playStrokes(p)).map((r) => r.slot)).toEqual([4])
})

test('a handoff joins the QB and the runner into one path with no flight and no routes', () => {
  const p = play({ ball: [...line(0, { x: LOS - 8, y: 100 }, { x: LOS - 16, y: 104 }), ...line(1, { x: LOS - 18, y: 106 }, { x: LOS + 60, y: 90 })], routes: [route(3, 20, 60)] })
  const strokes = playStrokes(p)
  expect(strokes.map((s) => s.kind)).toEqual(['run', 'run'])
  expect(strokes[1].points[0]).toMatchObject({ x: LOS - 16, y: 104 })
  expect(routeLines(p, strokes)).toEqual([])
})

test('an interception return is drawn in the defense colors like a fumble recovery', () => {
  const p = play({ interception: true, ball: [...line(0, { x: LOS - 8, y: 100 }, { x: LOS - 40, y: 100 }), ...line(18, { x: LOS + 150, y: 80 }, { x: LOS + 40, y: 80 })] })
  const strokes = playStrokes(p)
  expect(strokes.at(-1)).toMatchObject({ kind: 'run', team: 1, part: 'recovery' })
  render(<RouteReplay play={p} abbrs={['BUF', 'MIA']} />)
  expect(screen.getByTestId('int-return').getAttribute('stroke')).toBe(teamColor('MIA').primary)
  expect(screen.queryByTestId('fumble-recovery')).toBeNull()
  expect(screen.getByText('INT')).toBeInTheDocument()
})

test('a kickoff draws the kick to the catch and the return from there', () => {
  const returner = [...line(10, { x: 0x700, y: 100 }, { x: 0x690, y: 100 }), ...line(10, { x: 0x690, y: 100 }, { x: 0x720, y: 80 })]
  const p = play({ kind: 'kickoff', offense: 0, field: { losX: 0x878, toGainX: null, attacksHigh: true }, ball: returner })
  const strokes = playStrokes(p)
  expect(strokes.map((s) => s.kind)).toEqual(['kick', 'run'])
  expect(strokes[0].points).toEqual([{ x: 0x878, y: expect.any(Number) }, expect.objectContaining({ x: 0x690 })])
  expect(strokes[1].points[0].x).toBe(0x690)
  expect(strokes[1].points.at(-1)?.x).toBe(0x720)
})

test('a field goal draws the kick to the posts', () => {
  const strokes = playStrokes(play({ kind: 'fieldGoal', field: { losX: 0x900, toGainX: null, attacksHigh: true } }))
  expect(strokes).toHaveLength(1)
  expect(strokes[0].kind).toBe('kick')
  expect(strokes[0].points[1].x).toBe(0x670 + 110 * 8)
})

test('the window keeps a 2 to 1 field around the play, the line of scrimmage and the line to gain', () => {
  const p = pass()
  const view = fieldWindow(p, playStrokes(p), [])
  expect(view.w / view.h).toBeCloseTo(2)
  expect(view.x).toBeLessThan(LOS - 40)
  expect(view.x + view.w).toBeGreaterThan(LOS + 176)
  const wide = play({ ball: line(1, { x: 0x680, y: 100 }, { x: 0x980, y: 100 }) })
  const big = fieldWindow(wide, playStrokes(wide), [])
  expect(big.x).toBeGreaterThanOrEqual(0x620)
  expect(big.x + big.w).toBeLessThanOrEqual(0x9e0)
})

test('the replay draws a real field with yard numbers, end zones and both lines', () => {
  const { container } = render(<RouteReplay play={pass()} abbrs={['BUF', 'MIA']} />)
  expect(container.querySelector('.field-los')).not.toBeNull()
  expect(container.querySelector('.field-gain')).not.toBeNull()
  expect(container.querySelectorAll('.field-num').length).toBeGreaterThan(0)
  expect(screen.getByTestId('ball-flight')).toBeInTheDocument()
  expect(screen.getAllByTestId('ball-path')).toHaveLength(2)
  expect(screen.getByText('+22')).toBeInTheDocument()
})

test('nothing renders without a play or without a ball path', () => {
  const { container, rerender } = render(<RouteReplay play={null} abbrs={['BUF', 'MIA']} />)
  expect(container).toBeEmptyDOMElement()
  rerender(<RouteReplay play={play()} abbrs={['BUF', 'MIA']} />)
  expect(container).toBeEmptyDOMElement()
})

test('an incomplete pass shows the routes and says INC', () => {
  const p = play({ thrown: true, yards: 0, ball: line(0, { x: LOS - 8, y: 100 }, { x: LOS - 48, y: 100 }), routes: [route(3, 20, 60), route(8, 6, 120)] })
  expect(routeLines(p, playStrokes(p)).map((r) => r.slot)).toEqual([3])
  render(<RouteReplay play={p} abbrs={['BUF', 'MIA']} />)
  expect(screen.getByText('INC')).toBeInTheDocument()
})

test('a route that jumps across the field is split instead of drawn as a straight line', () => {
  const jumpy: Route = { slot: 3, points: [{ x: LOS, y: 60 }, { x: LOS + 8, y: 60 }, { x: LOS + 200, y: 160 }, { x: LOS + 208, y: 160 }] }
  const p = play({ thrown: true, ball: line(0, { x: LOS - 8, y: 100 }, { x: LOS - 48, y: 100 }), routes: [jumpy] })
  const { container } = render(<RouteReplay play={p} abbrs={['BUF', 'MIA']} />)
  expect(container.querySelector('.route-other')?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
})

test('a catch fumbled to the defense says FUMBLE', () => {
  const p = play({ thrown: true, yards: 0, ball: [...line(0, { x: LOS - 8, y: 100 }, { x: LOS - 40, y: 100 }), ...line(3, { x: LOS + 120, y: 60 }, { x: LOS + 150, y: 60 }), ...line(19, { x: LOS + 152, y: 60 }, { x: LOS + 140, y: 70 })] })
  render(<RouteReplay play={p} abbrs={['BUF', 'MIA']} />)
  expect(screen.getByText('FUMBLE')).toBeInTheDocument()
})

test('a thrown pass draws the real flight from the release to where it ended instead of the carrier gap', () => {
  const p = play({
    ...pass(),
    pass: { from: { x: LOS - 30, y: 100 }, to: { x: LOS + 118, y: 62 }, outcome: 'caught', target: null },
  })
  const strokes = playStrokes(p)
  expect(strokes.map((s) => s.kind)).toEqual(['run', 'flight', 'run'])
  expect(strokes[0].points.at(-1)?.x).toBeCloseTo(LOS - 30.4)
  expect(strokes[1].points).toEqual([{ x: LOS - 30, y: 100 }, { x: LOS + 118, y: 62 }])
  expect(strokes[2].points[0]).toMatchObject({ x: LOS + 118, y: 62 })
})

test('an incomplete or knocked down pass ends in an X with no label box', () => {
  const thrown = (outcome: 'incomplete' | 'deflected') =>
    play({ thrown: true, yards: 0, people: { passer: 0 }, ball: line(0, { x: LOS - 8, y: 100 }, { x: LOS - 48, y: 100 }), pass: { from: { x: LOS - 40, y: 100 }, to: { x: LOS + 96, y: 50 }, outcome, target: null } })
  const { rerender } = render(<RouteReplay play={thrown('incomplete')} abbrs={['BUF', 'MIA']} />)
  expect(screen.getByTestId('ball-flight')).toBeInTheDocument()
  expect(screen.getByTestId('pass-x')).toBeInTheDocument()
  expect(screen.queryByTestId('pass-end')).toBeNull()
  rerender(<RouteReplay play={thrown('deflected')} abbrs={['BUF', 'MIA']} />)
  expect(screen.getByTestId('pass-x')).toBeInTheDocument()
  expect(document.querySelector('.label-plate, .pass-label')).toBeNull()
})

const caught = () =>
  play({
    ...pass(),
    thrown: true,
    people: { passer: 0, receiver: 3 },
    pass: { from: { x: LOS - 40, y: 100 }, to: { x: LOS + 120, y: 60 }, outcome: 'caught', target: null },
    airYards: 15,
    yac: 7,
  })

test('the last play field fills the whole box at its aspect ratio', () => {
  const p = pass()
  const wide = fieldWindow(p, playStrokes(p), [], 3)
  expect(wide.w / wide.h).toBeCloseTo(3)
  expect(wide.h).toBeGreaterThanOrEqual(0xcf - 0x10)
  expect(wide.w).toBeGreaterThan(fieldWindow(p, playStrokes(p), []).w)
  expect(wide.x).toBeLessThan(LOS - 40)
  expect(wide.x + wide.w).toBeGreaterThan(LOS + 176)
  const edge = play({ ball: line(1, { x: 0x630, y: 100 }, { x: 0x650, y: 100 }) })
  const clamped = fieldWindow(edge, playStrokes(edge), [], 3.5)
  expect(clamped.x).toBeGreaterThanOrEqual(0x620)
  expect(clamped.w / clamped.h).toBeCloseTo(3.5)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 600, height: 200, x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 200, toJSON: () => ({}) })
  render(<RouteReplay play={p} abbrs={['BUF', 'MIA']} />)
  const [, , w, h] = (screen.getByTestId('route-replay').getAttribute('viewBox') ?? '').split(' ').map(Number)
  expect(w / h).toBeCloseTo(3)
})

test('the telestrator colors the throw and the run after the catch differently', () => {
  const p = caught()
  expect(playStrokes(p).map((s) => s.part)).toEqual(['drop', 'air', 'yac'])
  const { container } = render(<RouteReplay play={p} abbrs={['BUF', 'MIA']} />)
  const [drop, yac] = screen.getAllByTestId('ball-path')
  expect(drop).toHaveClass('route-neutral')
  expect(yac).toHaveClass('route-yac')
  expect(screen.getByTestId('ball-flight')).toHaveClass('route-neutral')
  const air = screen.getByTestId('ball-air')
  expect(air).toHaveClass('route-air')
  expect(air.getAttribute('d')).toMatch(new RegExp(`^M${LOS},`))
  expect(container.querySelector('.air-key')).toBeNull()
  const css = readFileSync(join(__dirname, 'broadcast.css'), 'utf8')
  expect(css).toMatch(/\.route-air \{\s*stroke: #3cd2ff;/)
  expect(css).toMatch(/\.route-yac \{\s*stroke: #ffd400;/)
  expect(css).toMatch(/\.air-swatch-air \{\s*background: #3cd2ff;/)
  expect(css).toMatch(/\.air-swatch-yac \{\s*background: #ffd400;/)
})

test('an incomplete pass or a run has no air path', () => {
  render(<RouteReplay play={pass()} abbrs={['BUF', 'MIA']} />)
  expect(screen.queryByTestId('ball-air')).toBeNull()
})

const fumbled = (ball: BallPoint[], index: number, rest: Partial<NonNullable<PlayResult['fumble']>>): PlayResult =>
  play({
    ball,
    fumble: { at: { x: ball[index].x, y: ball[index].y }, frame: 0, index, by: { team: 0, rosterIndex: 2 }, recoveredBy: null, recovery: null, lost: false, ...rest },
  })

test('a fumble the offense keeps still shows the gain and only a lost fumble drops it', () => {
  const run = line(1, { x: LOS, y: 100 }, { x: LOS + 176, y: 100 })
  render(<RouteReplay play={fumbled(run, run.length - 1, {})} abbrs={['BUF', 'MIA']} />)
  expect(screen.getByText('+22')).toBeInTheDocument()
  expect(screen.getByTestId('fumble-burst')).toBeInTheDocument()
  expect(screen.queryByTestId('fumble-label')).toBeNull()
  cleanup()
  render(<RouteReplay play={fumbled(run, 5, { recovery: { slot: 1, frame: 0, index: 6 }, recoveredBy: { team: 0, rosterIndex: 2 } })} abbrs={['BUF', 'MIA']} />)
  expect(screen.getByText('+22')).toBeInTheDocument()
  cleanup()
  const lost = [...run.slice(0, 6), ...line(15, { x: LOS + 90, y: 104 }, { x: LOS + 40, y: 120 })]
  render(<RouteReplay play={fumbled(lost, 5, { recovery: { slot: 15, frame: 0, index: 6 }, recoveredBy: { team: 1, rosterIndex: 4 }, lost: true })} abbrs={['BUF', 'MIA']} />)
  expect(screen.queryByText(/^[+-]\d+$/)).toBeNull()
  expect(screen.queryByTestId('fumble-label')).toBeNull()
})

type Box = { x0: number; y0: number; x1: number; y1: number }
const num = (el: Element, name: string) => Number(el.getAttribute(name))
const textBox = (el: Element): Box => {
  const size = num(el, 'font-size')
  const half = ((el.textContent ?? '').length * size * 0.62) / 2
  return { x0: num(el, 'x') - half, y0: num(el, 'y') - size * 0.8, x1: num(el, 'x') + half, y1: num(el, 'y') + size * 0.2 }
}
const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

test('the end label stays clear of the yard numerals and inside the view, even at the sidelines', () => {
  const { fieldZeroX, unitsPerYard } = TSB2026_MAP
  const ends = [...Array.from({ length: 15 }, (_, i) => LOS - 420 + i * 60), ...[10, 20, 80, 90].map((yard) => fieldZeroX + yard * unitsPerYard)]
  const ys = [0x10, 0x14, 0x30, 0x70, 0xb0, 0xca, 0xcf]
  let checked = 0
  for (const y of ys) {
    for (const end of ends) {
      const run = line(1, { x: LOS, y: 100 }, { x: end, y })
      const { container, unmount } = render(<RouteReplay play={fumbled(run, run.length - 1, {})} abbrs={['BUF', 'MIA']} />)
      const gain = container.querySelector('.route-end-label')
      for (const numeral of container.querySelectorAll('.field-num')) if (gain) expect(hits(textBox(gain), textBox(numeral))).toBe(false)
      const [x, top, w, h] = (container.querySelector('svg')?.getAttribute('viewBox') ?? '').split(' ').map(Number)
      if (gain) {
        const g = textBox(gain)
        expect(g.x0).toBeGreaterThanOrEqual(x)
        expect(g.y0).toBeGreaterThanOrEqual(top)
        expect(g.x1).toBeLessThanOrEqual(x + w)
        expect(g.y1).toBeLessThanOrEqual(top + h)
      }
      checked++
      unmount()
    }
  }
  expect(checked).toBe(ys.length * ends.length)
})

test('a touchback draws the kick arc into the end zone with a TOUCHBACK label', () => {
  const p = play({ kind: 'punt', kicked: true, yards: 0, kickResult: 'touchback', ball: line(21, { x: 0x990, y: 120 }, { x: 0x9b0, y: 120 }) })
  const { container } = render(<RouteReplay play={p} abbrs={['BUF', 'MIA']} />)
  expect(screen.getAllByTestId('ball-kick')).toHaveLength(1)
  expect(screen.queryByTestId('ball-path')).toBeNull()
  expect(container.querySelector('.route-end-label')?.textContent).toBe('TOUCHBACK')
  expect(playStrokes(p)[0].points.at(-1)).toEqual({ x: 0x9b0, y: 120 })
})
