import type { Drive, PlayResult } from './playTracker'
import type { GameState } from './types'

export type Look = 'footage' | 'topdown' | 'telestrator'
export type Headline = { team: 0 | 1; rosterIndex: number; text: string }

const LOOKS: readonly Look[] = ['footage', 'topdown', 'telestrator']
const UNITS_PER_YARD = 8
const FRAMES_PER_SECOND = 60
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

export function pickLook(play: PlayResult, previous: Look | null, random: () => number): Look {
  if (play.touchdown) return 'footage'
  if (play.sack || play.interception) return 'topdown'
  const options = LOOKS.filter((look) => look !== previous)
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))]
}

function carrierSamples(play: PlayResult): { sample: number; slot: number }[] {
  const out: { sample: number; slot: number }[] = []
  let cursor = 0
  for (const point of play.ball) {
    let found = -1
    for (let i = cursor; i < play.tracks.players.length; i++) {
      const at = play.tracks.players[i][point.slot]
      if (at && at.x === point.x && at.y === point.y) {
        found = i
        break
      }
    }
    if (found < 0) continue
    out.push({ sample: found, slot: point.slot })
    cursor = found + 1
  }
  return out
}

const nearestDefender = (positions: { x: number; y: number }[], slot: number) => {
  const from = positions[slot]
  const rivals = positions.filter((_, i) => teamOf(i) !== teamOf(slot))
  if (!from || rivals.length === 0) return null
  return Math.min(...rivals.map((p) => yardsBetween(from, p)))
}

export function separation(play: PlayResult): { slot: number; yards: number; sample: number } | null {
  if (!play.thrown) return null
  const catchPoint = carrierSamples(play).find((c) => teamOf(c.slot) === play.offense && c.slot % 11 !== 0)
  if (!catchPoint) return null
  const yards = nearestDefender(play.tracks.players[catchPoint.sample], catchPoint.slot)
  if (yards === null) return null
  return { slot: catchPoint.slot, yards: tenth(yards), sample: catchPoint.sample }
}

export function pressure(play: PlayResult): { yards: number; seconds: number } | null {
  if (play.kicked) return null
  const carried = carrierSamples(play)
  if (carried.length === 0) return null
  const snap = carried[0]
  const released = carried.find((c) => c.slot !== snap.slot)
  const stop = released && play.thrown ? released.sample : play.tracks.players.length
  let best: { yards: number; sample: number } | null = null
  for (let i = snap.sample; i < stop; i++) {
    const yards = nearestDefender(play.tracks.players[i], snap.slot)
    if (yards !== null && (!best || yards < best.yards)) best = { yards, sample: i }
  }
  if (!best) return null
  const seconds = (play.tracks.frames[best.sample] - play.tracks.frames[snap.sample]) / FRAMES_PER_SECOND
  return { yards: tenth(best.yards), seconds: tenth(seconds) }
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
