import { TARGET_ROM_SHA1 } from '../../rom/validateRom'
import type { Addr, MemoryMap } from '../memoryMap'

const ram = (offset: number): Addr => ({ region: 'ram', offset })
const sram = (offset: number): Addr => ({ region: 'sram', offset })

export const TSB2026_MAP: MemoryMap = {
  romSha1: TARGET_ROM_SHA1,
  gameStatus: ram(0x07),
  inGameValues: [0x11, 0x12, 0x13, 0x14],
  breakValue: 0x03,
  playStatus: ram(0x71),
  screenMode: ram(0x0f),
  playSelectMode: 0x13,
  fieldMode: 0x16,
  controlled: [ram(0x84), ram(0x86)],
  bits: { over: 0x80, touchdown: 0x10, snapped: 0x04, kicked: 0x02, sack: 0x01, scrimmage: 0x08, thrown: 0x20 },
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
  scoresBcd: true,
  timeouts: [ram(0x8c), ram(0x8d)],
  losX: ram(0x7f),
  firstDownX: ram(0x82),
  fieldZeroX: 0x670,
  unitsPerYard: 8,
  fieldSide: { p1AlwaysDefendsLowX: true },
  players: { base: ram(0x39f), count: 22, stride: 0x20, x: 0x14, y: 0x17, positionId: 0x08, collision: 0x00, jumping: 0x08 },
  statBlocks: [sram(0x406), sram(0x50b)],
  lineups: { addrs: [sram(0x610), sram(0x644)], defenseOffset: 11, returners: { position: 10, kickoff: 24, punt: 25 } },
  playCalls: { addrs: [ram(0x78), ram(0x79)], passFrom: 0x04, specialFrom: 0x08 },
  ballStatus: { addr: ram(0x72), fumbled: 0x10, deflected: 0x40, caught: 0x20 },
  kickStatus: { addr: ram(0x73), touchback: 0x10, outOfBounds: 0x80 },
  passTarget: { icons: [ram(0x88), ram(0x89)], position: 0x1f, cleared: 0x80 },
  ball: { collision: ram(0x8e), moving: 0x80, collided: 0x40, x: ram(0x93), y: ram(0x90) },
  cameraX: ram(0x54),
  cameraY: null,
}

export const ROUTES_ENABLED = true
export const LIVE_DETECTION = true
