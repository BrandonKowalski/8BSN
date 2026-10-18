import type { Addr, MemoryMap } from './memoryMap'
import { VISIBLE_TOP } from '../emu/presenter'

function word(ram: Uint8Array, addr: Addr): number {
  return (ram[addr.offset] ?? 0) | ((ram[addr.offset + 1] ?? 0) << 8)
}

export function fieldToScreen(ram: Uint8Array, map: MemoryMap, p: { x: number; y: number }): { x: number; y: number } | null {
  if (!map.cameraX || ram[map.screenMode.offset] !== map.fieldMode) return null
  const y = map.cameraY ? p.y - word(ram, map.cameraY) : p.y
  return { x: p.x - word(ram, map.cameraX), y: y + 1 - VISIBLE_TOP }
}
