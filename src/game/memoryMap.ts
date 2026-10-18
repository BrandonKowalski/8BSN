export type Addr = { region: 'ram' | 'sram'; offset: number }

export type FieldSide = { addr: Addr; p1DefendsLowXWhen: number } | { p1AlwaysDefendsLowX: true }

export interface MemoryMap {
  romSha1: string
  gameStatus: Addr
  inGameValues: number[]
  breakValue: number
  playStatus: Addr
  screenMode: Addr
  playSelectMode: number
  controlled: [Addr, Addr]
  bits: { over: number; touchdown: number; snapped: number; kicked: number; sack: number; scrimmage: number; thrown: number }
  quarter: Addr
  down: Addr
  clockSeconds: Addr
  clockMinutes: Addr
  clockBcd: boolean
  teamIds: [Addr, Addr]
  offense: Addr
  offenseP2Mask: number
  holderP2Mask: number
  playKind: { mask: number; kickoff: number; punt: number; fieldGoal: number; extraPoint: number }
  scores: [Addr, Addr]
  timeouts: [Addr, Addr]
  losX: Addr
  firstDownX: Addr
  fieldZeroX: number
  unitsPerYard: number
  fieldSide: FieldSide | null
  players: { base: Addr; count: 22; stride: number; x: number; y: number; positionId: number }
  statBlocks: [Addr, Addr]
}
