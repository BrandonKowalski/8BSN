export type PasserLine = { att: number; comp: number; yds: number; td: number; int: number }
export type RusherLine = { att: number; yds: number; td: number }
export type ReceiverLine = { rec: number; yds: number; td: number }
export type DefenderLine = { sacks: number; int: number }
export type PlayerStats = { rosterIndex: number; pass?: PasserLine; rush?: RusherLine; rec?: ReceiverLine; def?: DefenderLine }
export type TeamState = { id: number; abbr: string; name: string; score: number; timeouts: number; players: PlayerStats[] }
export type PlayKind = 'scrimmage' | 'kickoff' | 'punt' | 'fieldGoal' | 'extraPoint'
export type GameState = {
  inGame: boolean
  live: boolean
  playOver: boolean
  touchdown: boolean
  sack: boolean
  kicked: boolean
  playKind: PlayKind
  isTry: boolean
  quarter: number
  clock: { min: number; sec: number }
  down: number
  yardsToGo: number
  ballOn: { yard: number; side: 0 | 1 | null }
  offense: 0 | 1
  possession: 0 | 1
  teams: [TeamState, TeamState]
  positions: { x: number; y: number }[]
  frame: number
}
