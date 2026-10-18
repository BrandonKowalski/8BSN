import type { Drive, PlayResult } from './playTracker'
import type { GameState } from './types'

export type LastPlayView = 'all22' | 'telestrator'
export type Headline = { team: 0 | 1; rosterIndex: number; text: string }

const UNITS_PER_YARD = 8
const BIG_GAIN = 20
const DRIVE_GAIN = 10

const tenth = (value: number) => Math.round(value * 10) / 10
const yardsBetween = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) / UNITS_PER_YARD
const teamOf = (slot: number) => (slot < 11 ? 0 : 1)

export function replayWorthy(play: PlayResult): boolean {
  return play.touchdown || play.interception || play.summary === 'FUMBLE LOST' || play.sack || play.yards >= BIG_GAIN
}

export function playOfDrive(plays: readonly PlayResult[], drive: Drive): PlayResult | null {
  const own = plays.filter((p) => p.offense === drive.offense && !p.isTry && !p.kicked && !p.sack && !p.interception && p.summary !== 'FUMBLE LOST')
  const score = own.find((p) => p.touchdown)
  if (score) return score
  return own.reduce<PlayResult | null>((best, p) => (p.yards >= DRIVE_GAIN && (!best || p.yards > best.yards) ? p : best), null)
}

const SAFETY_POINTS = 2

export function lastPlayView(play: PlayResult): LastPlayView {
  if (play.isTry || play.kicked || play.kind !== 'scrimmage') return 'telestrator'
  if (play.sack || play.interception || play.fumble?.lost || play.summary === 'FUMBLE LOST') return 'all22'
  const outcome = play.pass?.outcome
  if (outcome === 'incomplete' || outcome === 'deflected') return 'all22'
  if (!play.pass && play.people.passer !== undefined && play.people.receiver === undefined) return 'all22'
  const defense = play.offense === 0 ? 1 : 0
  if (play.scoreAfter[defense] - play.scoreBefore[defense] === SAFETY_POINTS) return 'all22'
  return 'telestrator'
}

export function ballSamples(play: PlayResult): (number | null)[] {
  const out: (number | null)[] = []
  let cursor = 0
  for (const point of play.ball) {
    let found = point.sample !== undefined && point.sample < play.tracks.players.length ? point.sample : -1
    for (let i = cursor; point.sample === undefined && i < play.tracks.players.length; i++) {
      const at = play.tracks.players[i][point.slot]
      if (at && at.x === point.x && at.y === point.y) {
        found = i
        break
      }
    }
    out.push(found < 0 ? null : found)
    if (found >= 0) cursor = found + 1
  }
  return out
}

export function carrierSamples(play: PlayResult): { sample: number; slot: number }[] {
  return ballSamples(play).flatMap((sample, i) => (sample === null ? [] : [{ sample, slot: play.ball[i].slot }]))
}

function nearestDefender(positions: { x: number; y: number }[], slot: number): { yards: number; slot: number } | null {
  const from = positions[slot]
  if (!from) return null
  let best: { yards: number; slot: number } | null = null
  positions.forEach((p, i) => {
    if (teamOf(i) === teamOf(slot)) return
    const yards = yardsBetween(from, p)
    if (!best || yards < best.yards) best = { yards, slot: i }
  })
  return best
}

export function separation(play: PlayResult): { slot: number; yards: number; sample: number; defender: number } | null {
  if (!play.thrown) return null
  const catchPoint = carrierSamples(play).find((c) => teamOf(c.slot) === play.offense && c.slot % 11 !== 0)
  if (!catchPoint) return null
  const nearest = nearestDefender(play.tracks.players[catchPoint.sample], catchPoint.slot)
  if (nearest === null) return null
  return { slot: catchPoint.slot, yards: tenth(nearest.yards), sample: catchPoint.sample, defender: nearest.slot }
}

const scorerOf = (play: PlayResult) => play.people.receiver ?? play.people.rusher

const isOffense = (play: PlayResult) => play.kind === 'scrimmage' && !play.isTry && !play.kicked

export function headline(play: PlayResult, plays: readonly PlayResult[], _state: GameState): Headline | null {
  const earlier = plays.filter((p) => p.index < play.index)
  const team = play.offense
  const make = (who: number, text: string): Headline => ({ team, rosterIndex: who, text })

  const rusher = play.people.rusher
  if (isOffense(play) && !play.sack && rusher !== undefined && play.people.passer === undefined) {
    const before = earlier
      .filter((p) => isOffense(p) && !p.sack && p.offense === team && p.people.rusher === rusher && p.people.passer === undefined)
      .reduce((total, p) => total + p.yards, 0)
    if (before < 100 && before + play.yards >= 100) return make(rusher, 'FIRST 100 YARD RUSHER OF THE GAME')
  }

  const receiver = play.people.receiver
  if (isOffense(play) && receiver !== undefined) {
    const before = earlier
      .filter((p) => isOffense(p) && p.offense === team && p.people.receiver === receiver)
      .reduce((total, p) => total + p.yards, 0)
    if (before < 100 && before + play.yards >= 100) return make(receiver, 'FIRST 100 YARD RECEIVER OF THE GAME')
  }

  const scorer = scorerOf(play)
  if (isOffense(play) && play.touchdown && scorer !== undefined) {
    const prior = earlier.filter((p) => isOffense(p) && p.touchdown && p.offense === team && scorerOf(p) === scorer).length
    if (prior === 1) return make(scorer, '2ND TOUCHDOWN OF THE GAME')
  }

  if (isOffense(play) && scorer !== undefined && play.yards >= BIG_GAIN && earlier.every((p) => p.yards < play.yards)) {
    return make(scorer, 'LONGEST PLAY OF THE GAME')
  }

  const defender = play.people.defender
  if (defender) {
    const same = (p: PlayResult) =>
      p.people.defender?.team === defender.team &&
      p.people.defender.rosterIndex === defender.rosterIndex &&
      p.people.defender.kind === defender.kind
    const prior = earlier.filter(same).length
    if (prior === 1 && defender.kind === 'sack' && play.sack) {
      return { team: defender.team, rosterIndex: defender.rosterIndex, text: '2ND SACK OF THE GAME' }
    }
    if (prior === 1 && defender.kind === 'int' && play.interception) {
      return { team: defender.team, rosterIndex: defender.rosterIndex, text: '2ND INTERCEPTION OF THE GAME' }
    }
  }
  return null
}
