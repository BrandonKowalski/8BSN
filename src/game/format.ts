import type { PlayResult } from './playTracker'
import type { RosterPlayer } from './roster'
import type { GameState, TeamState } from './types'
import type { PlayerLookup } from './useGame'

const ORDINALS = ['1ST', '2ND', '3RD', '4TH']

export function formatClock(c: { min: number; sec: number }): string {
  return `${c.min}:${String(c.sec).padStart(2, '0')}`
}

export function formatQuarter(q: number): string {
  return q >= 4 ? 'OT' : ORDINALS[Math.max(0, q)]
}

export function formatDownDistance(down: number, togo: number): string {
  const ordinal = ORDINALS[Math.min(Math.max(down, 1), 4) - 1]
  return togo <= 0 ? `${ordinal} & GOAL` : `${ordinal} & ${togo}`
}

export function formatBallOn(b: GameState['ballOn'], teams: [TeamState, TeamState]): string {
  if (b.side === null || b.yard === 50) return '50'
  return `${teams[b.side].abbr} ${b.yard}`
}

const BREAKS = ['END 1ST', 'HALFTIME', 'END 3RD']

export function onAir(state: GameState | null): state is GameState {
  return state !== null && (state.inGame || state.inBreak)
}

export function formatSituation(s: Pick<GameState, 'inBreak' | 'quarter' | 'teams' | 'playKind' | 'isTry' | 'down' | 'yardsToGo'>): string {
  if (s.inBreak) {
    if (s.quarter < BREAKS.length) return BREAKS[s.quarter]
    return s.quarter === 3 && s.teams[0].score === s.teams[1].score ? 'END 4TH' : 'FINAL'
  }
  if (s.playKind === 'kickoff') return 'KICKOFF'
  if (s.isTry) return 'PAT'
  return formatDownDistance(s.down, s.yardsToGo)
}

export type Fit = 'full' | 'initial' | 'last'

export function playerName(p: Pick<RosterPlayer, 'first' | 'last'>, fit: Fit): string {
  const last = p.last.toUpperCase()
  if (fit === 'last' || !p.first) return last
  if (fit === 'initial') return `${p.first[0].toUpperCase()}. ${last}`
  return `${p.first.toUpperCase()} ${last}`
}

const yardage = (yards: number, word: string) => `${Math.abs(yards)} YARD ${word}`

export function playHeadline(play: PlayResult, player: PlayerLookup, fit: Fit): string {
  const { people, summary, yards } = play
  const named = (team: 0 | 1, index: number | undefined) => {
    const who = index === undefined ? null : player(team, index)
    return who && who.last ? playerName(who, fit) : null
  }
  if (play.isTry || play.kind !== 'scrimmage') return summary
  if (play.sack) {
    const defender = people.defender ? named(people.defender.team, people.defender.rosterIndex) : null
    return defender ? `${defender} SACK, ${yardage(yards, 'LOSS')}` : `SACKED FOR ${yardage(yards, 'LOSS')}`
  }
  if (play.interception) {
    const defender = people.defender ? named(people.defender.team, people.defender.rosterIndex) : null
    return defender ? `INTERCEPTED BY ${defender}` : summary
  }
  const passer = named(play.offense, people.passer)
  const receiver = named(play.offense, people.receiver)
  const rusher = named(play.offense, people.rusher)
  const fumble = summary.includes(', FUMBLE') ? ', FUMBLE' : ''
  const deflector = play.pass?.outcome === 'deflected' && play.pass.by ? named(play.pass.by.team, play.pass.by.rosterIndex) : null
  if (passer && people.receiver === undefined) return deflector ? `${passer} PASS KNOCKED DOWN BY ${deflector}` : `${passer} PASS INCOMPLETE`
  if (passer && receiver) {
    const gain = play.touchdown ? yardage(yards, 'TOUCHDOWN PASS') : yards > 0 ? yardage(yards, 'PASS') : null
    return gain ? `${passer} ${gain} TO ${receiver}` : `${passer} PASS TO ${receiver}, ${yards === 0 ? 'NO GAIN' : yardage(yards, 'LOSS')}`
  }
  if (rusher && !passer) {
    const gain = play.touchdown
      ? yardage(yards, 'TOUCHDOWN RUN')
      : yards > 0
        ? yardage(yards, 'RUSH')
        : yards === 0
          ? 'NO GAIN'
          : yardage(yards, 'LOSS')
    return `${rusher} ${gain}${fumble}`
  }
  return summary
}
