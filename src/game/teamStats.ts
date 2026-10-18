import { formatClock } from './format'
import type { Drive, PlayResult } from './playTracker'
import type { GameState, PlayerStats, TeamState } from './types'

export type Comparison = { label: string; values: [string, string]; leader: 0 | 1 | null }[]

const RED_ZONE_YARDS = 20

const sum = (team: TeamState, pick: (p: PlayerStats) => number | undefined) =>
  team.players.reduce((total, p) => total + (pick(p) ?? 0), 0)

const leaderOf = (a: number, b: number, lowerWins = false): 0 | 1 | null => {
  if (a === b) return null
  return (a > b) !== lowerWins ? 0 : 1
}

const distanceToGoal = (play: PlayResult) => {
  const { yard, side } = play.startBallOn
  const fromP1 = side === 0 ? yard : side === 1 ? 100 - yard : 50
  return play.offense === 0 ? 100 - fromP1 : fromP1
}

const isScrimmage = (play: PlayResult) => play.kind === 'scrimmage' && !play.isTry && !play.kicked

const thirdDowns = (plays: readonly PlayResult[], team: 0 | 1): [number, number] => {
  const tries = plays.filter((p) => p.offense === team && p.down === 3 && isScrimmage(p))
  return [tries.filter((p) => p.touchdown || p.yards >= p.toGo).length, tries.length]
}

export function drivePlays(plays: readonly PlayResult[], drives: readonly Drive[]): PlayResult[][] {
  const queue = plays.filter((p) => !p.isTry && p.kind !== 'kickoff')
  let cursor = 0
  return drives.map((drive) => {
    while (cursor < queue.length && queue[cursor].offense !== drive.offense) cursor += 1
    const taken = queue.slice(cursor, cursor + drive.plays)
    cursor += drive.plays
    return taken
  })
}

const redZone = (plays: readonly PlayResult[], drives: readonly Drive[], team: 0 | 1): [number, number] => {
  const taken = drivePlays(plays, drives)
  let entered = 0
  let converted = 0
  drives.forEach((drive, i) => {
    if (drive.offense !== team) return
    if (taken[i].some((p) => distanceToGoal(p) <= RED_ZONE_YARDS)) {
      entered += 1
      if (drive.result === 'TD') converted += 1
    }
  })
  return [converted, entered]
}

const turnovers = (plays: readonly PlayResult[], team: 0 | 1) =>
  plays.filter((p) => p.offense === team && (p.interception || p.summary === 'FUMBLE LOST')).length

const clock = (seconds: number) => formatClock({ min: Math.floor(seconds / 60), sec: seconds % 60 })

const ofText = ([made, tried]: [number, number]) => `${made} OF ${tried}`

export function teamComparison(
  plays: readonly PlayResult[],
  drives: readonly Drive[],
  state: GameState,
  possession: [number, number],
): Comparison {
  const [a, b] = state.teams
  const rush = [sum(a, (p) => p.rush?.yds), sum(b, (p) => p.rush?.yds)]
  const pass = [sum(a, (p) => p.rec?.yds), sum(b, (p) => p.rec?.yds)]
  const third = [thirdDowns(plays, 0), thirdDowns(plays, 1)]
  const zone = [redZone(plays, drives, 0), redZone(plays, drives, 1)]
  const lost = [turnovers(plays, 0), turnovers(plays, 1)]
  return [
    { label: 'TOTAL YDS', values: [String(rush[0] + pass[0]), String(rush[1] + pass[1])], leader: leaderOf(rush[0] + pass[0], rush[1] + pass[1]) },
    { label: 'RUSH YDS', values: [String(rush[0]), String(rush[1])], leader: leaderOf(rush[0], rush[1]) },
    { label: 'PASS YDS', values: [String(pass[0]), String(pass[1])], leader: leaderOf(pass[0], pass[1]) },
    { label: '3RD DOWN', values: [ofText(third[0]), ofText(third[1])], leader: leaderOf(third[0][0], third[1][0]) },
    { label: 'RED ZONE', values: [ofText(zone[0]), ofText(zone[1])], leader: leaderOf(zone[0][0], zone[1][0]) },
    { label: 'TURNOVERS', values: [String(lost[0]), String(lost[1])], leader: leaderOf(lost[0], lost[1], true) },
    { label: 'POSSESSION', values: [clock(possession[0]), clock(possession[1])], leader: leaderOf(possession[0], possession[1]) },
  ]
}
