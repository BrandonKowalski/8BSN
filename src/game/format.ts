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

type Spot = Pick<GameState, 'ballOn' | 'offense' | 'yardsToGo'>
type Situation = Pick<GameState, 'inBreak' | 'quarter' | 'teams' | 'playKind' | 'isTry' | 'caught' | 'down' | 'yardsToGo' | 'ballOn' | 'offense'>

export function yardsToGoal(s: Pick<GameState, 'ballOn' | 'offense'>): number {
  if (s.ballOn.side === null) return 50
  return s.ballOn.side === s.offense ? 100 - s.ballOn.yard : s.ballOn.yard
}

export function goalToGo(s: Spot): boolean {
  return s.yardsToGo <= 0 || s.yardsToGo >= yardsToGoal(s)
}

export function redZone(s: Pick<GameState, 'ballOn' | 'offense'>): boolean {
  return yardsToGoal(s) <= 20
}

const downText = (s: Situation) => formatDownDistance(s.down, goalToGo(s) ? 0 : s.yardsToGo)

export function breakLabel(ended: number, teams: GameState['teams']): string {
  if (ended < BREAKS.length) return BREAKS[Math.max(0, ended)]
  return ended === BREAKS.length && teams[0].score === teams[1].score ? 'END 4TH' : 'FINAL'
}

const KICKS = { kickoff: 'KICKOFF', punt: 'PUNT' } as const

export const returnWord = (kind: keyof typeof KICKS) => `${KICKS[kind]} RETURN`

export function formatSituation(s: Situation, ended: number | null = null): string {
  if (s.inBreak) return breakLabel(ended ?? s.quarter - 1, s.teams)
  if (s.playKind === 'kickoff' || s.playKind === 'punt') return s.caught ? returnWord(s.playKind) : KICKS[s.playKind]
  if (s.isTry) return 'PAT'
  if (s.playKind === 'fieldGoal') return 'FIELD GOAL'
  return downText(s)
}

const SCORE_WORDS: Record<number, string> = { 6: 'TOUCHDOWN', 3: 'FIELD GOAL', 2: 'SAFETY' }

export function scoreWord(points: number, isTry: boolean): string | null {
  if (isTry) return points === 1 || points === 2 ? 'PAT' : null
  return SCORE_WORDS[points] ?? null
}

export type TagFit = 'full' | 'initial' | 'last' | 'lastNoPos'

export const TAG_FITS: readonly TagFit[] = ['full', 'initial', 'last', 'lastNoPos']

export function playerName(p: Pick<RosterPlayer, 'first' | 'last'>, fit: TagFit): string {
  const last = p.last.toUpperCase()
  if (fit === 'last' || fit === 'lastNoPos' || !p.first) return last
  if (fit === 'initial') return `${p.first[0].toUpperCase()}. ${last}`
  return `${p.first.toUpperCase()} ${last}`
}

export type TagParts = { number: string | null; name: string; position: string | null }

export function playerTag(p: RosterPlayer, fit: TagFit): TagParts {
  return {
    number: Number.isFinite(p.number) ? `#${p.number}` : null,
    name: playerName(p, fit),
    position: fit === 'lastNoPos' || !p.position ? null : p.position,
  }
}

export function playerLabel(p: RosterPlayer, fit: TagFit): string {
  const { number, name, position } = playerTag(p, fit)
  return [number, name, position].filter((part) => part !== null).join(' ')
}

export function fitTag(make: (fit: TagFit) => string, chars: number, fits: readonly TagFit[] = TAG_FITS): string {
  return fits.map(make).find((text) => text.length <= chars) ?? make(fits[fits.length - 1])
}

const yardage = (yards: number, word: string) => `${Math.abs(yards)} YARD ${word}`

export const returningTeam = (play: Pick<PlayResult, 'kind' | 'offense'>): 0 | 1 => (play.kind === 'punt' ? (play.offense === 0 ? 1 : 0) : play.offense)

export const KICK_WORDS: Partial<Record<PlayResult['kind'], string>> = KICKS

export function returnRun(play: Pick<PlayResult, 'kind' | 'returnYards'>): string {
  const word = KICK_WORDS[play.kind] ?? 'KICK'
  const yards = play.returnYards ?? 0
  return yards > 0 ? yardage(yards, `${word} RETURN`) : `${word} RETURN, ${yards === 0 ? 'NO GAIN' : yardage(yards, 'LOSS')}`
}

function kickHeadline(play: PlayResult, named: (team: 0 | 1, index: number | undefined) => string | null): string | null {
  const word = KICK_WORDS[play.kind]
  if (!word || !play.kickResult) return null
  if (play.kickResult === 'touchback') return `${word}, TOUCHBACK`
  if (play.kickResult === 'outOfBounds') return `${word} OUT OF BOUNDS`
  const returner = named(returningTeam(play), play.returner ?? undefined)
  return returner ? `${returner} ${returnRun(play)}` : null
}

export function playHeadline(play: PlayResult, player: PlayerLookup, fit: TagFit): string {
  const { people, summary, yards } = play
  const named = (team: 0 | 1, index: number | undefined) => {
    const who = index === undefined ? null : player(team, index)
    return who && who.last ? playerName(who, fit) : null
  }
  const fumbled = play.fumble ?? null
  const recoverer = fumbled?.recoveredBy ? named(fumbled.recoveredBy.team, fumbled.recoveredBy.rosterIndex) : null
  const kick = kickHeadline(play, named)
  if (kick) return kick
  if (play.isTry || play.kind !== 'scrimmage') return summary
  if (play.sack) {
    const defender = people.defender ? named(people.defender.team, people.defender.rosterIndex) : null
    return defender ? `${defender} SACK, ${yardage(yards, 'LOSS')}` : `SACKED FOR ${yardage(yards, 'LOSS')}`
  }
  const target = play.pass ? named(play.offense, play.pass.target ?? undefined) : null
  const intended = target ? `, INTENDED FOR ${target}` : ''
  if (play.interception) {
    const defender = people.defender ? named(people.defender.team, people.defender.rosterIndex) : null
    return defender ? `INTERCEPTED BY ${defender}${intended}` : summary
  }
  if (fumbled?.lost) {
    if (!recoverer) return summary
    const runner = fumbled.by ? named(fumbled.by.team, fumbled.by.rosterIndex) : null
    return `${runner ? `${runner} ` : ''}FUMBLE, RECOVERED BY ${recoverer}`
  }
  const passer = named(play.offense, people.passer)
  const receiver = named(play.offense, people.receiver)
  const rusher = named(play.offense, people.rusher)
  const recovered = !fumbled?.recovery ? ', OUT OF BOUNDS' : recoverer ? `, RECOVERED BY ${recoverer}` : ''
  const fumble = fumbled ? `, FUMBLE${recovered}` : summary.includes(', FUMBLE') ? ', FUMBLE' : ''
  const deflector = play.pass?.outcome === 'deflected' && play.pass.by ? named(play.pass.by.team, play.pass.by.rosterIndex) : null
  if (passer && people.receiver === undefined) {
    if (!deflector) return `${passer} PASS INCOMPLETE${intended}`
    return target ? `${passer} PASS INTENDED FOR ${target}, KNOCKED DOWN BY ${deflector}` : `${passer} PASS KNOCKED DOWN BY ${deflector}`
  }
  if (passer && receiver) {
    const gain = play.touchdown ? yardage(yards, 'TOUCHDOWN PASS') : yards > 0 ? yardage(yards, 'PASS') : null
    return `${gain ? `${passer} ${gain} TO ${receiver}` : `${passer} PASS TO ${receiver}, ${yards === 0 ? 'NO GAIN' : yardage(yards, 'LOSS')}`}${fumble}`
  }
  if (rusher && !passer) {
    const gain = play.touchdown
      ? yardage(yards, play.scramble ? 'TOUCHDOWN SCRAMBLE' : 'TOUCHDOWN RUN')
      : yards > 0
        ? yardage(yards, play.scramble ? 'SCRAMBLE' : 'RUSH')
        : yards === 0
          ? 'NO GAIN'
          : yardage(yards, 'LOSS')
    return `${rusher} ${gain}${fumble}`
  }
  return summary
}
