import { expect, test } from 'vitest'
import { DEFAULT_LAYOUT as SDK_LAYOUT } from '@8bsn/sdk'
import type { Rect } from '../sdk/types'
import { DEFAULT_LAYOUT, FULL_W, MENU_SCALE, gameStyle, regionStyle } from './layout'

const L = 50 - FULL_W / 2
const M = 50 - (FULL_W * MENU_SCALE) / 2

function expectRect(actual: Partial<Rect>, expected: Partial<Rect>) {
  for (const key of Object.keys(expected) as (keyof Rect)[]) expect(actual[key]).toBeCloseTo(expected[key]!, 3)
}

test('the default layout reproduces the old box geometry', () => {
  expect(FULL_W).toBeCloseTo(64.286, 3)
  expect(MENU_SCALE).toBe(0.86)
  const { game, regions } = DEFAULT_LAYOUT
  for (const phase of ['live', 'pregame', 'break'] as const) expectRect(game[phase], { x: L, y: 0, w: FULL_W })
  expectRect(game.window, { x: 1.5, y: 2, w: 45.5 })
  expectRect(game.menus, { x: M, y: 0, w: FULL_W * MENU_SCALE })
  expectRect(regions.top.rect, { x: 49, y: 2, w: 49, h: 42 })
  expectRect(regions.replay.rect, { x: 49, y: 2, w: 49, h: 86 })
  expectRect(regions.stats.rect, { x: 49, y: 46, w: 49, h: 42 })
  expectRect(regions.left.rect, { x: 18, y: 73.5, w: 29, h: 14.5 })
  expectRect(regions.ticker.rect, { x: 18, y: 89.5, w: 80, h: 8.5 })
  expectRect(regions.ticker.phases!.menus!, { x: M, y: 89.5, w: FULL_W * MENU_SCALE, h: 8.5 })
  expectRect(regions.scorebug.rect, { x: 0, y: 0, w: 100, h: 100 })
  expectRect(regions.watermark.rect, { x: 0, y: 0, w: 100, h: 100 })
  for (const name of ['top', 'replay', 'stats', 'left'] as const) expect(regions[name].show).toEqual(['window'])
  expect(regions.ticker.show).toEqual(['window', 'menus'])
  expect([...regions.scorebug.show].sort()).toEqual(['break', 'live', 'menus', 'pregame', 'window'])
  expect(regions.watermark.show).toEqual(['menus', 'pregame', 'live', 'break'])
  expect(SDK_LAYOUT).toBe(DEFAULT_LAYOUT)
})

test('gameStyle in the window phase scales by 45.5 over FULL_W', () => {
  const transform = String(gameStyle(DEFAULT_LAYOUT, 'window').transform)
  const [, dx, dy, scale] = transform.match(/^translate\(([-\d.]+)cqw, ([-\d.]+)cqh\) scale\(([\d.]+)\)$/)!.map(Number)
  expect(dx).toBeCloseTo(1.5 - L, 6)
  expect(dy).toBe(2)
  expect(scale).toBeCloseTo(45.5 / FULL_W, 9)
  expect(gameStyle(DEFAULT_LAYOUT, 'live').transform).toBe('translate(0cqw, 0cqh) scale(1)')
})

test('regionStyle hides a region outside its phases', () => {
  expect(regionStyle(DEFAULT_LAYOUT, 'top', 'live')).toBeNull()
  expect(regionStyle(DEFAULT_LAYOUT, 'watermark', 'window')).toBeNull()
  expect(regionStyle(DEFAULT_LAYOUT, 'top', 'window')).toEqual({ left: '49cqw', top: '2cqh', width: '49cqw', height: '42cqh' })
})

test('the ticker centers under the game in menus', () => {
  const style = regionStyle(DEFAULT_LAYOUT, 'ticker', 'menus')!
  const left = parseFloat(String(style.left))
  const width = parseFloat(String(style.width))
  expect(left + width / 2).toBeCloseTo(50, 6)
  expect(width).toBeCloseTo(FULL_W * MENU_SCALE, 6)
  expect(regionStyle(DEFAULT_LAYOUT, 'ticker', 'window')).toEqual({ left: '18cqw', top: '89.5cqh', width: '80cqw', height: '8.5cqh' })
})
