import type { Snapshot } from '@8bsn/sdk'
import type { MemoryMap } from './memoryMap'

export type LineupPlayer = { entry: number; role: string; rosterIndex: number }
export type LineupUnit = 'offense' | 'defense'
export type Lineup = { team: 0 | 1; unit: LineupUnit; players: LineupPlayer[] }

export const OFFENSE_ROLES = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'C', 'LG', 'RG', 'LT', 'RT']
export const DEFENSE_ROLES = ['RE', 'NT', 'LE', 'ROLB', 'RILB', 'LILB', 'LOLB', 'RCB', 'LCB', 'FS', 'SS']

export function startersAt(snap: Snapshot, map: MemoryMap, team: 0 | 1, unit: LineupUnit): LineupPlayer[] {
  const table = map.lineups.addrs[team]
  const data = table.region === 'ram' ? snap.ram : snap.sram
  const teamId = (map.teamIds[team].region === 'ram' ? snap.ram : snap.sram)[map.teamIds[team].offset]
  const roles = unit === 'offense' ? OFFENSE_ROLES : DEFENSE_ROLES
  const first = unit === 'offense' ? 0 : map.lineups.defenseOffset
  return roles.flatMap((role, i) => {
    const entry = first + i
    const at = table.offset + entry * 2
    return data[at] === teamId ? [{ entry, role, rosterIndex: data[at + 1] }] : []
  })
}
