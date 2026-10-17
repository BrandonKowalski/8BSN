import type { PlayerStats } from '../../game/types'

type Pass = NonNullable<PlayerStats['pass']>
type Rush = NonNullable<PlayerStats['rush']>
type Rec = NonNullable<PlayerStats['rec']>
type Def = NonNullable<PlayerStats['def']>

function withTd(text: string, td: number): string {
  return td > 0 ? `${text} ${td} TD` : text
}

export const passLine = (name: string, pass: Pass): string =>
  `${name} ${pass.comp}/${pass.att} ${pass.yds} YDS ${pass.td} TD ${pass.int} INT`

export const rushLine = (name: string, rush: Rush): string => withTd(`${name} ${rush.att}-${rush.yds}`, rush.td)

export const recLine = (name: string, rec: Rec): string => withTd(`${name} ${rec.rec}-${rec.yds}`, rec.td)

export function defLine(name: string, def: Def): string {
  const parts = []
  if (def.sacks > 0) parts.push(`${def.sacks} SACK`)
  if (def.int > 0) parts.push(`${def.int} INT`)
  return `${name} ${parts.join(' ')}`
}
