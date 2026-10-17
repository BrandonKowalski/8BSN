import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { PlayResult, Route } from '../../game/playTracker'
import RouteReplay, { ballCarrierSlot, routePaths } from './RouteReplay'

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.doUnmock('../../game/maps/tsb2026')
})

const BOX = { w: 200, h: 100 }
const LOS = 0x800

const still = (slot: number, y: number): Route => ({ slot, points: [{ x: LOS, y }, { x: LOS, y }, { x: LOS + 1, y }] })
const run = (slot: number, y: number, yards: number): Route => ({
  slot,
  points: Array.from({ length: yards + 1 }, (_, i) => ({ x: LOS + i * 8, y })),
})

const play = (routes: Route[], offense: 0 | 1 = 0): PlayResult => ({
  index: 4,
  offense,
  quarter: 1,
  yards: 10,
  touchdown: false,
  sack: false,
  interception: false,
  kicked: false,
  routes,
  summary: 'TEST',
})

test('routePaths drops a stationary lineman and keeps a receiver with a 15-yard path', () => {
  const paths = routePaths([still(7, 90), run(3, 60, 15)], BOX)
  expect(paths.map((p) => p.slot)).toEqual([3])
})

test('a straight 10-yard route starts with M and has the scaled length', () => {
  const [path] = routePaths([still(7, 90), run(3, 60, 10)], BOX)
  expect(path.d.startsWith('M')).toBe(true)
  expect(path.length).toBeCloseTo((10 * BOX.h) / ((0xc6 - 0x19) / 8), 5)
})

test('the line of scrimmage sits a third of the way across and P2 is mirrored', () => {
  const [forward] = routePaths([still(7, 90), run(3, 60, 10)], BOX, 0)
  const mirrored = routePaths([{ slot: 3, points: run(3, 60, 10).points.map((p) => ({ x: LOS - (p.x - LOS), y: p.y })) }, still(7, 90)], BOX, 1)[0]
  expect(forward.d.startsWith(`M${Math.round((BOX.w / 3) * 100) / 100},`)).toBe(true)
  expect(mirrored.d).toBe(forward.d)
})

test('a lineman who backpedals 3 yards is dropped', () => {
  const backpedal: Route = { slot: 8, points: [0, 1, 2, 3].map((i) => ({ x: LOS - i * 8, y: 90 })) }
  const paths = routePaths([backpedal, run(3, 60, 15)], BOX)
  expect(paths.map((p) => p.slot)).toEqual([3])
})

test('a 45-yard route stays inside the box', () => {
  const [path] = routePaths([still(7, 90), run(3, 60, 45)], BOX)
  const xs = path.d.match(/-?[\d.]+(?=,)/g)!.map(Number)
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
  expect(Math.max(...xs)).toBeLessThanOrEqual(BOX.w)
})

test('the ball carrier is the route ending farthest downfield for the offense', () => {
  const routes = [run(1, 50, 4), run(2, 60, 18), run(3, 70, 9)]
  expect(ballCarrierSlot(routes, 0)).toBe(2)
  const left = routes.map((r) => ({ slot: r.slot, points: r.points.map((p) => ({ x: LOS - (p.x - LOS), y: p.y })) }))
  expect(ballCarrierSlot(left, 1)).toBe(2)
})

test('the component draws highlighted and plain paths', () => {
  const { container } = render(<RouteReplay play={play([run(1, 50, 4), run(2, 60, 18)])} />)
  const paths = container.querySelectorAll('path')
  expect(paths).toHaveLength(2)
  expect(paths[0].getAttribute('stroke')).toBe('#55ccff')
  expect(paths[1].getAttribute('stroke')).toBe('#ffe600')
})

test('the component renders nothing for a null play', () => {
  const { container } = render(<RouteReplay play={null} />)
  expect(container.querySelector('path')).toBeNull()
})

test('the component renders no path when ROUTES_ENABLED is false', async () => {
  vi.resetModules()
  vi.doMock('../../game/maps/tsb2026', async (original) => ({ ...(await original<object>()), ROUTES_ENABLED: false }))
  const { default: Disabled } = await import('./RouteReplay')
  const { container } = render(<Disabled play={play([run(2, 60, 18)])} />)
  expect(container.querySelector('path')).toBeNull()
})
