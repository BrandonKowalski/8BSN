import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import type { BallPoint, PlayResult, Route } from '../../game/playTracker'
import RouteReplay, { fieldWindow, playStrokes, routeLines } from './RouteReplay'

afterEach(cleanup)

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

test('an interception return is drawn for the defense', () => {
  const p = play({ interception: true, ball: [...line(0, { x: LOS - 8, y: 100 }, { x: LOS - 40, y: 100 }), ...line(18, { x: LOS + 150, y: 80 }, { x: LOS + 40, y: 80 })] })
  const strokes = playStrokes(p)
  expect(strokes.at(-1)).toMatchObject({ kind: 'run', team: 1 })
  render(<RouteReplay play={p} abbrs={['BUF', 'MIA']} />)
  expect(screen.getAllByTestId('ball-path').at(-1)).toHaveClass('route-turnover')
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

test('the replay window size keeps the field and draws finer lines', () => {
  const { container, rerender } = render(<RouteReplay play={pass()} abbrs={['BUF', 'MIA']} />)
  const card = Number(container.querySelector('.field-los')?.getAttribute('stroke-width'))
  rerender(<RouteReplay play={pass()} abbrs={['BUF', 'MIA']} size="replay" />)
  expect(screen.getByTestId('route-replay')).toHaveClass('route-replay-replay')
  expect(Number(container.querySelector('.field-los')?.getAttribute('stroke-width'))).toBeLessThan(card)
})
