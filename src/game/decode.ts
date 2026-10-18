import type { Addr, MemoryMap } from './memoryMap'
import type { RosterTeam } from './roster'
import type { Snapshot } from '../emu/snapshot'
import type { GameState, PlayCall, PlayerStats, PlayKind, TeamState } from './types'

const OL_FIRST = 12
const OL_LAST = 16
const QB_BLOCK = 10
const SKILL_BLOCK = 16
const SKILL_START = 20
const DEF_BLOCK = 5
const DEF_START = 180
const FIRST_DOWN_MARKER_UNITS = 80
const DEFLECT_REACH = 24

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

function slotAt(snap: Snapshot, map: MemoryMap, addr: Addr): number | null {
  const { base, count, stride } = map.players
  const offset = word(snap, addr) - base.offset
  if (offset < 0 || offset % stride !== 0 || offset / stride >= count) return null
  return offset / stride
}

export function rosterIndexAt(snap: Snapshot, map: MemoryMap, slot: number): number | null {
  const { base, count, stride, positionId } = map.players
  if (slot < 0 || slot >= count) return null
  const id = snap.ram[base.offset + slot * stride + positionId] ?? 0
  const side: 0 | 1 = id & map.offenseP2Mask ? 1 : 0
  const onDefense = ((id ^ byte(snap, map.offense)) & map.offenseP2Mask) !== 0
  const position = (id & ~map.offenseP2Mask) + (onDefense ? map.lineups.defenseOffset : 0)
  if (position >= 2 * map.lineups.defenseOffset) return null
  const lineup = map.lineups.addrs[side]
  const entry = { region: lineup.region, offset: lineup.offset + position * 2 }
  if (byte(snap, entry) !== byte(snap, map.teamIds[side])) return null
  return byte(snap, { region: entry.region, offset: entry.offset + 1 })
}

export function returnerIndexAt(snap: Snapshot, map: MemoryMap, slot: number, kind: PlayKind): number | null {
  const { base, count, stride, positionId } = map.players
  const { addrs, returners } = map.lineups
  if (slot < 0 || slot >= count || (kind !== 'kickoff' && kind !== 'punt')) return rosterIndexAt(snap, map, slot)
  const id = snap.ram[base.offset + slot * stride + positionId] ?? 0
  if ((id & ~map.offenseP2Mask) !== returners.position) return rosterIndexAt(snap, map, slot)
  const side: 0 | 1 = id & map.offenseP2Mask ? 1 : 0
  const entry = { region: addrs[side].region, offset: addrs[side].offset + (kind === 'kickoff' ? returners.kickoff : returners.punt) * 2 }
  if (byte(snap, entry) !== byte(snap, map.teamIds[side])) return null
  return byte(snap, { region: entry.region, offset: entry.offset + 1 })
}

function ballInAir(snap: Snapshot, map: MemoryMap): GameState['ballInAir'] {
  const bits = byte(snap, map.ball.collision)
  if ((bits & map.ball.moving) === 0 || (bits & map.ball.collided) !== 0) return null
  return { x: word(snap, map.ball.x), y: byte(snap, map.ball.y) }
}

function deflectorAt(snap: Snapshot, map: MemoryMap, offense: 0 | 1): GameState['deflector'] {
  const { base, count, stride, x, y, collision, jumping } = map.players
  const side = count / 2
  const ballX = word(snap, map.ball.x)
  const ballY = byte(snap, map.ball.y)
  let best: { slot: number; distance: number } | null = null
  for (let slot = (1 - offense) * side; slot < (2 - offense) * side; slot++) {
    const at = base.offset + slot * stride
    if ((snap.ram[at + collision] & jumping) === 0) continue
    const distance = Math.hypot((snap.ram[at + x] | (snap.ram[at + x + 1] << 8)) - ballX, snap.ram[at + y] - ballY)
    if (distance <= DEFLECT_REACH && (!best || distance < best.distance)) best = { slot, distance }
  }
  return best && { slot: best.slot, rosterIndex: rosterIndexAt(snap, map, best.slot) }
}

function p1DefendsLow(snap: Snapshot, map: MemoryMap): boolean {
  const side = map.fieldSide
  if (!side || 'p1AlwaysDefendsLowX' in side) return true
  return byte(snap, side.addr) === side.p1DefendsLowXWhen
}

export function isLive(ram: Uint8Array, map: MemoryMap): boolean {
  const status = ram[map.playStatus.offset] ?? 0
  return (
    map.inGameValues.includes(ram[map.gameStatus.offset] ?? 0) &&
    (status & map.bits.snapped) !== 0 &&
    (status & (map.bits.over | map.bits.touchdown)) === 0
  )
}

function callOf(value: number, map: MemoryMap): PlayCall | null {
  if (value >= map.playCalls.specialFrom) return null
  return value >= map.playCalls.passFrom ? 'pass' : 'run'
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
      playSelect: false,
      betweenPlays: false,
      playOver: false,
      touchdown: false,
      sack: false,
      kicked: false,
      thrown: false,
      playKind: 'scrimmage',
      call: null,
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
      carrier: null,
      carrierRoster: null,
      caught: false,
      touchback: false,
      outOfBounds: false,
      fumbled: false,
      ballInAir: null,
      deflected: false,
      deflector: null,
      field: { losX: map.fieldZeroX + 50 * map.unitsPerYard, toGainX: null, attacksHigh: true },
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
  const live = isLive(snap.ram, map)
  const rawKind = kindOf(possessionByte, map)
  const kickoffPending = snapped ? (status & map.bits.scrimmage) === 0 : holder !== offense
  const playKind: PlayKind = rawKind === 'kickoff' && !kickoffPending ? 'scrimmage' : rawKind
  const lowIsP1 = p1DefendsLow(snap, map)
  const deflected = inGame && (byte(snap, map.ballStatus.addr) & map.ballStatus.deflected) !== 0

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
  const receiving: 0 | 1 = rawKind === 'kickoff' ? offense : rawKind === 'punt' ? (offense === 0 ? 1 : 0) : holder
  const carrier = inGame ? slotAt(snap, map, map.controlled[receiving]) : null

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
    playSelect: inGame && byte(snap, map.screenMode) === map.playSelectMode,
    betweenPlays: inGame && status === 0 && playKind !== 'kickoff',
    playOver: inGame && (over || touchdown),
    touchdown: inGame && touchdown,
    sack: inGame && (status & map.bits.sack) !== 0,
    kicked: inGame && (status & map.bits.kicked) !== 0,
    thrown: inGame && (status & map.bits.thrown) !== 0,
    playKind,
    call: playKind === 'scrimmage' && !isTry ? callOf(byte(snap, map.playCalls.addrs[offense]), map) : null,
    isTry,
    quarter: Math.min(4, byte(snap, map.quarter)),
    clock: { min: decode(byte(snap, map.clockMinutes)), sec: decode(byte(snap, map.clockSeconds)) },
    down: Math.min(4, byte(snap, map.down) + 1),
    yardsToGo,
    ballOn,
    offense,
    possession: live && rawKind !== 'kickoff' ? offense : holder,
    teams,
    positions,
    carrier,
    carrierRoster: carrier === null ? null : returnerIndexAt(snap, map, carrier, playKind),
    caught: inGame && (byte(snap, map.ballStatus.addr) & map.ballStatus.caught) !== 0,
    touchback: inGame && (byte(snap, map.kickStatus.addr) & map.kickStatus.touchback) !== 0,
    outOfBounds: inGame && (byte(snap, map.kickStatus.addr) & map.kickStatus.outOfBounds) !== 0,
    fumbled: inGame && (byte(snap, map.ballStatus.addr) & map.ballStatus.fumbled) !== 0,
    ballInAir: inGame ? ballInAir(snap, map) : null,
    deflected,
    deflector: deflected ? deflectorAt(snap, map, offense) : null,
    field: { losX, toGainX: reachesGoal || isTry ? null : lineToGain, attacksHigh },
    frame: snap.frame,
  }
}
