export type Addr = { region: 'ram' | 'sram'; offset: number }

export type FieldSide = { addr: Addr; p1DefendsLowXWhen: number } | { p1AlwaysDefendsLowX: true }

export interface MemoryMap {
  romSha1: string
  gameStatus: Addr
  inGameValues: number[]
  breakValue: number
  breakScreen: { addr: Addr; scoreboard: number }
  playStatus: Addr
  screenMode: Addr
  playSelectMode: number
  fieldMode: number
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
  scoresBcd: boolean
  timeouts: [Addr, Addr]
  losX: Addr
  firstDownX: Addr
  fieldZeroX: number
  unitsPerYard: number
  fieldSide: FieldSide | null
  players: { base: Addr; count: 22; stride: number; x: number; y: number; positionId: number; collision: number; jumping: number }
  statBlocks: [Addr, Addr]
  lineups: { addrs: [Addr, Addr]; defenseOffset: number; returners: { position: number; kickoff: number; punt: number } }
  playCalls: { addrs: [Addr, Addr]; passFrom: number; specialFrom: number }
  ballStatus: { addr: Addr; fumbled: number; deflected: number; caught: number }
  kickStatus: { addr: Addr; touchback: number; outOfBounds: number }
  scene: { addr: Addr; referee: number; card: number; matchup: number; coinToss: number }
  passTarget: { icons: [Addr, Addr]; position: number; cleared: number }
  ball: { collision: Addr; moving: number; collided: number; x: Addr; y: Addr }
  cameraX: Addr | null
  cameraY: Addr | null
}
