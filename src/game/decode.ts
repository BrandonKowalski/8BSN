import type { Addr, MemoryMap } from './memoryMap'
import type { RosterTeam } from './roster'
import type { Snapshot } from '../emu/snapshot'
import type { GameState, PlayerStats, PlayKind, TeamState } from './types'

const OL_FIRST = 12
const OL_LAST = 16
const QB_BLOCK = 10
const SKILL_BLOCK = 16
const SKILL_START = 20
const DEF_BLOCK = 5
const DEF_START = 180
const FIRST_DOWN_MARKER_UNITS = 80

function region(snap: Snapshot, addr: Addr): Uint8Array {
  return addr.region === 'ram' ? snap.ram : snap.sram
}

function byte(snap: Snapshot, addr: Addr): number {
  return region(snap, addr)[addr.offset] ?? 0
}

function word(snap: Snapshot, addr: Addr): number {
  const data = region(snap, addr)
  return (data[addr.offset] ?? 0) | ((data[addr.offset + 1] ?? 0) << 8)
}

function bcd(value: number): number {
  return (value >> 4) * 10 + (value & 0x0f)
}

function signed16(data: Uint8Array, at: number): number {
  const value = data[at] | (data[at + 1] << 8)
  return value >= 0x8000 ? value - 0x10000 : value
}

function statsFor(sram: Uint8Array, base: number, index: number): PlayerStats | null {
  if (index >= OL_FIRST && index <= OL_LAST) return null
  if (index < 2) {
    const at = base + index * QB_BLOCK
    return {
      rosterIndex: index,
      pass: { att: sram[at], comp: sram[at + 1], td: sram[at + 2], int: sram[at + 3], yds: signed16(sram, at + 4) },
      rush: { att: sram[at + 6], yds: signed16(sram, at + 7), td: sram[at + 9] },
    }
  }
  if (index < OL_FIRST) {
    const at = base + SKILL_START + (index - 2) * SKILL_BLOCK
    return {
      rosterIndex: index,
      rec: { rec: sram[at], yds: signed16(sram, at + 1), td: sram[at + 3] },
      rush: { att: sram[at + 12], yds: signed16(sram, at + 13), td: sram[at + 15] },
    }
  }
  if (index <= 27) {
    const at = base + DEF_START + (index - 17) * DEF_BLOCK
    return { rosterIndex: index, def: { sacks: sram[at], int: sram[at + 1] } }
  }
  return null
}

function buildTeam(snap: Snapshot, map: MemoryMap, roster: RosterTeam[], side: 0 | 1): TeamState {
  const id = byte(snap, map.teamIds[side])
  const team = roster.find((t) => t.id === id)
  const players: PlayerStats[] = []
  if (team) {
    const base = map.statBlocks[side].offset
    for (let index = 0; index < team.players.length; index++) {
      const stats = statsFor(snap.sram, base, index)
      if (stats) players.push(stats)
    }
  }
  return {
    id,
    abbr: team?.abbr ?? '???',
    name: team?.name ?? '???',
    score: byte(snap, map.scores[side]),
    timeouts: byte(snap, map.timeouts[side]),
    players,
  }
}

function kindOf(possession: number, map: MemoryMap): PlayKind {
  const bits = possession & map.playKind.mask
  if (bits === map.playKind.kickoff) return 'kickoff'
  if (bits === map.playKind.punt) return 'punt'
  if (bits === map.playKind.fieldGoal) return 'fieldGoal'
  if (bits === map.playKind.extraPoint) return 'extraPoint'
  return 'scrimmage'
}

function p1DefendsLow(snap: Snapshot, map: MemoryMap): boolean {
  const side = map.fieldSide
  if (!side || 'p1AlwaysDefendsLowX' in side) return true
  return byte(snap, side.addr) === side.p1DefendsLowXWhen
}

export function decodeGameState(snap: Snapshot, map: MemoryMap, roster: RosterTeam[]): GameState {
  const gameStatus = byte(snap, map.gameStatus)
  const inGame = map.inGameValues.includes(gameStatus)
  const teams: [TeamState, TeamState] = [
    buildTeam(snap, map, roster, 0),
    buildTeam(snap, map, roster, 1),
  ]
  const known = (side: 0 | 1) => roster.some((t) => t.id === teams[side].id)
  const inBreak = !inGame && gameStatus === map.breakValue && known(0) && known(1)
  if (!inGame && !inBreak) {
    return {
      inGame,
      inBreak,
      live: false,
      playOver: false,
      touchdown: false,
      sack: false,
      kicked: false,
      playKind: 'scrimmage',
      isTry: false,
      quarter: 0,
      clock: { min: 0, sec: 0 },
      down: 1,
      yardsToGo: 0,
      ballOn: { yard: 50, side: null },
      offense: 0,
      possession: 0,
      teams,
      positions: [],
      frame: snap.frame,
    }
  }

  const status = byte(snap, map.playStatus)
  const over = (status & map.bits.over) !== 0
  const touchdown = (status & map.bits.touchdown) !== 0
  const snapped = (status & map.bits.snapped) !== 0
  const decode = (value: number) => (map.clockBcd ? bcd(value) : value)
  const possessionByte = byte(snap, map.offense)
  const offense: 0 | 1 = possessionByte & map.offenseP2Mask ? 1 : 0
  const holder: 0 | 1 = possessionByte & map.holderP2Mask ? 1 : 0
  const live = inGame && snapped && !(over || touchdown)
  const rawKind = kindOf(possessionByte, map)
  const kickoffPending = snapped ? (status & map.bits.scrimmage) === 0 : holder !== offense
  const playKind: PlayKind = rawKind === 'kickoff' && !kickoffPending ? 'scrimmage' : rawKind
  const lowIsP1 = p1DefendsLow(snap, map)

  const losX = word(snap, map.losX)
  const markerX = word(snap, map.firstDownX)
  const unit = map.unitsPerYard
  const attacksHigh = (offense === 0) === lowIsP1
  const direction = attacksHigh ? 1 : -1
  const lineToGain = markerX + direction * FIRST_DOWN_MARKER_UNITS
  const goalX = map.fieldZeroX + (attacksHigh ? 100 * unit : 0)
  const reachesGoal = attacksHigh ? lineToGain >= goalX : lineToGain <= goalX
  const remaining = direction * (lineToGain - losX)
  const isTry = playKind === 'extraPoint' || markerX === goalX
  const yardsToGo = reachesGoal ? 0 : Math.max(0, Math.ceil(remaining / unit))

  const fromLow = Math.min(100, Math.max(0, Math.round((losX - map.fieldZeroX) / unit)))
  const lowSide: 0 | 1 = lowIsP1 ? 0 : 1
  const highSide: 0 | 1 = lowIsP1 ? 1 : 0
  const ballOn: GameState['ballOn'] =
    fromLow === 50
      ? { yard: 50, side: null }
      : fromLow < 50
        ? { yard: fromLow, side: lowSide }
        : { yard: 100 - fromLow, side: highSide }

  const positions: GameState['positions'] = []
  const { base, count, stride, x, y } = map.players
  for (let i = 0; inGame && i < count; i++) {
    const at = base.offset + i * stride
    positions.push({ x: snap.ram[at + x] | (snap.ram[at + x + 1] << 8), y: snap.ram[at + y] })
  }

  return {
    inGame,
    inBreak,
    live,
    playOver: inGame && (over || touchdown),
    touchdown: inGame && touchdown,
    sack: inGame && (status & map.bits.sack) !== 0,
    kicked: inGame && (status & map.bits.kicked) !== 0,
    playKind,
    isTry,
    quarter: Math.min(4, byte(snap, map.quarter)),
    clock: { min: decode(byte(snap, map.clockMinutes)), sec: decode(byte(snap, map.clockSeconds)) },
    down: Math.min(4, byte(snap, map.down) + 1),
    yardsToGo,
    ballOn,
    offense,
    possession: live ? offense : holder,
    teams,
    positions,
    frame: snap.frame,
  }
}
