import { TARGET_ROM_SHA1 } from '../../rom/validateRom'
import type { Addr, MemoryMap } from '../memoryMap'

const ram = (offset: number): Addr => ({ region: 'ram', offset })
const sram = (offset: number): Addr => ({ region: 'sram', offset })

export const TSB2026_MAP: MemoryMap = {
  romSha1: TARGET_ROM_SHA1,
  gameStatus: ram(0x07),
  inGameValues: [0x11, 0x12, 0x13, 0x14],
  playStatus: ram(0x71),
  bits: { over: 0x80, touchdown: 0x10, snapped: 0x04, kicked: 0x02, sack: 0x01, scrimmage: 0x08 },
  quarter: ram(0x76),
  down: ram(0x77),
  clockSeconds: ram(0x6a),
  clockMinutes: ram(0x6b),
  clockBcd: true,
  teamIds: [ram(0x6c), ram(0x6d)],
  offense: ram(0x70),
  offenseP2Mask: 0x80,
  holderP2Mask: 0x40,
  playKind: { mask: 0x1c, kickoff: 0x08, punt: 0x0c, fieldGoal: 0x10, extraPoint: 0x14 },
  scores: [ram(0x399), ram(0x39e)],
  timeouts: [ram(0x8c), ram(0x8d)],
  losX: ram(0x7f),
  firstDownX: ram(0x82),
  fieldZeroX: 0x670,
  unitsPerYard: 8,
  fieldSide: { p1AlwaysDefendsLowX: true },
  players: { base: ram(0x39f), count: 22, stride: 0x20, x: 0x14, y: 0x17, positionId: 0x08 },
  statBlocks: [sram(0x406), sram(0x50b)],
}

export const ROUTES_ENABLED = true
export const LIVE_DETECTION = true
