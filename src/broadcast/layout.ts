import type { CSSProperties } from 'react'
import { PHASES, type Layout, type Phase, type Region } from '../sdk/types'

export const FULL_W = 100 * (9 / 16) * (8 / 7)
export const MENU_SCALE = 0.86

const FULL_X = 50 - FULL_W / 2
const MENU_W = FULL_W * MENU_SCALE
const MENU_X = 50 - MENU_W / 2
const FULL = { x: FULL_X, y: 0, w: FULL_W }
const WINDOW: readonly Phase[] = ['window']

export const DEFAULT_LAYOUT: Layout = {
  game: {
    live: FULL,
    pregame: FULL,
    break: FULL,
    window: { x: 1.5, y: 2, w: 45.5 },
    menus: { x: MENU_X, y: 0, w: MENU_W },
  },
  regions: {
    top: { rect: { x: 49, y: 2, w: 49, h: 42 }, show: WINDOW },
    replay: { rect: { x: 49, y: 2, w: 49, h: 86 }, show: WINDOW },
    stats: { rect: { x: 49, y: 46, w: 49, h: 42 }, show: WINDOW },
    left: { rect: { x: 18, y: 73.5, w: 29, h: 14.5 }, show: WINDOW },
    ticker: {
      rect: { x: 18, y: 89.5, w: 80, h: 8.5 },
      phases: { menus: { x: MENU_X, y: 89.5, w: MENU_W, h: 8.5 } },
      show: ['window', 'menus'],
    },
    scorebug: { rect: { x: 0, y: 0, w: 100, h: 100 }, show: PHASES },
    watermark: { rect: { x: 0, y: 0, w: 100, h: 100 }, show: ['menus', 'pregame', 'live', 'break'] },
  },
}

export function gameStyle(layout: Layout, phase: Phase): CSSProperties {
  const { x, y, w } = layout.game[phase]
  return { transform: `translate(${x - FULL_X}cqw, ${y}cqh) scale(${w / FULL_W})` }
}

export function regionStyle(layout: Layout, region: Region, phase: Phase): CSSProperties | null {
  const placement = layout.regions[region]
  if (!placement.show.includes(phase)) return null
  const { x, y, w, h } = placement.phases?.[phase] ?? placement.rect
  return { left: `${x}cqw`, top: `${y}cqh`, width: `${w}cqw`, height: `${h}cqh` }
}
