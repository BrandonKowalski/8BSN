import type { Addr, MemoryMap } from './memoryMap'
import { VISIBLE_TOP } from '@8bsn/sdk'

function word(ram: Uint8Array, addr: Addr): number {
  return (ram[addr.offset] ?? 0) | ((ram[addr.offset + 1] ?? 0) << 8)
}

export const fieldOnScreen = (ram: Uint8Array, map: MemoryMap) => ram[map.screenMode.offset] === map.fieldMode

export function fieldToScreen(ram: Uint8Array, map: MemoryMap, p: { x: number; y: number }): { x: number; y: number } | null {
  if (!map.cameraX || !fieldOnScreen(ram, map)) return null
  const y = map.cameraY ? p.y - word(ram, map.cameraY) : p.y
  return { x: p.x - word(ram, map.cameraX), y: y + 1 - VISIBLE_TOP }
}

export const FEET_PX = 16

export function fieldToScreenFeet(ram: Uint8Array, map: MemoryMap, p: { x: number; y: number }): { x: number; y: number } | null {
  const at = fieldToScreen(ram, map, p)
  return at && { x: at.x, y: at.y + FEET_PX }
}
