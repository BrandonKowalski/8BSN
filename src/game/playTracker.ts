import { formatClock } from './format'
import type { GameState, PlayerStats, TeamState } from './types'

export type Route = { slot: number; points: { x: number; y: number }[] }
export type PlayResult = {
  index: number
  offense: 0 | 1
  quarter: number
  yards: number
  touchdown: boolean
  sack: boolean
  interception: boolean
  kicked: boolean
  routes: Route[]
  summary: string
}
export type DriveResult = 'TD' | 'FG' | 'PUNT' | 'TURNOVER' | 'END_OF_HALF' | 'IN_PROGRESS'
export type Drive = { offense: 0 | 1; plays: number; yards: number; startClock: string; result: DriveResult }
export type BigMoment = { kind: 'LONG_TD' | 'BIG_PLAY' | 'SACK' | 'INT'; play: PlayResult; text: string }
export type TrackerEvent = { type: 'snap' } | { type: 'playEnd'; play: PlayResult } | { type: 'bigMoment'; moment: BigMoment }

type Names = (team: 0 | 1, rosterIndex: number) => string
type Snapshot = { teams: [TeamState, TeamState]; ballOn: GameState['ballOn']; offense: 0 | 1; quarter: number }
type OpenPlay = { start: Snapshot; startClock: string; startScore: number; routes: Route[]; sack: boolean; touchdown: boolean; kicked: boolean }
type OpenDrive = { offense: 0 | 1; plays: number; yards: number; startClock: string; startScore: number; lastKicked: boolean }

const BIG_PLAY_YARDS = 25
const LONG_TD_YARDS = 40

const sum = (players: PlayerStats[], pick: (p: PlayerStats) => number | undefined) =>
  players.reduce((total, p) => total + (pick(p) ?? 0), 0)

const rushYards = (team: TeamState) => sum(team.players, (p) => p.rush?.yds)
const recYards = (team: TeamState) => sum(team.players, (p) => p.rec?.yds)
const interceptions = (team: TeamState) => sum(team.players, (p) => p.def?.int)

const snapshot = (state: GameState): Snapshot => ({
  teams: JSON.parse(JSON.stringify(state.teams)) as [TeamState, TeamState],
  ballOn: { ...state.ballOn },
  offense: state.offense,
  quarter: state.quarter,
})

const distanceFromP1Goal = (ballOn: GameState['ballOn']) =>
  ballOn.side === 0 ? ballOn.yard : ballOn.side === 1 ? 100 - ballOn.yard : 50

const findChange = (
  before: PlayerStats[],
  after: PlayerStats[],
  pick: (p: PlayerStats) => number | undefined,
): PlayerStats | undefined =>
  after.find((p) => {
    const prior = before.find((b) => b.rosterIndex === p.rosterIndex)
    return (pick(p) ?? 0) > (prior ? pick(prior) ?? 0 : 0)
  })

export class PlayTracker {
  private readonly recordRoutes: boolean
  private readonly names: Names
  private open: OpenPlay | null = null
  private playList: PlayResult[] = []
  private closedDrives: Drive[] = []
  private drive: OpenDrive | null = null
  private momentList: BigMoment[] = []
  private possession: [number, number] = [0, 0]
  private longestRush: [number, number] = [0, 0]
  private longestRec: [number, number] = [0, 0]
  private prevClock: number | null = null
  private prevQuarter: number | null = null

  constructor(opts: { recordRoutes: boolean; names?: Names }) {
    this.recordRoutes = opts.recordRoutes
    this.names = opts.names ?? (() => '')
  }

  push(state: GameState): TrackerEvent[] {
    if (!state.inGame) return []
    const events: TrackerEvent[] = []
    this.trackClock(state)
    if (!this.open) this.closeDriveIfNeeded(state)
    if (this.open) {
      if (state.playOver) this.finishPlay(state, events)
      else this.samplePlay(state)
    } else if (state.live && !state.playOver) {
      this.startPlay(state)
      events.push({ type: 'snap' })
    }
    this.prevQuarter = state.quarter
    return events
  }

  plays(): readonly PlayResult[] {
    return this.playList
  }

  drives(): readonly Drive[] {
    if (!this.drive) return this.closedDrives
    const { offense, plays, yards, startClock } = this.drive
    return [...this.closedDrives, { offense, plays, yards, startClock, result: 'IN_PROGRESS' }]
  }

  moments(): readonly BigMoment[] {
    return this.momentList
  }

  timeOfPossession(): [number, number] {
    return [this.possession[0], this.possession[1]]
  }

  longest(team: 0 | 1, kind: 'rush' | 'rec'): number {
    return (kind === 'rush' ? this.longestRush : this.longestRec)[team]
  }

  private trackClock(state: GameState) {
    const seconds = state.clock.min * 60 + state.clock.sec
    if (this.prevClock !== null && seconds < this.prevClock) {
      this.possession[state.offense] += this.prevClock - seconds
    }
    this.prevClock = seconds
  }

  private closeDriveIfNeeded(state: GameState) {
    if (!this.drive) return
    const halfEnded = this.prevQuarter === 1 && state.quarter === 2
    if (halfEnded || (!state.live && state.offense !== this.drive.offense)) {
      this.closeDrive(state.teams[this.drive.offense].score, halfEnded)
    }
  }

  private closeDrive(score: number, endOfHalf: boolean) {
    const drive = this.drive
    if (!drive) return
    const delta = score - drive.startScore
    let result: DriveResult
    if (delta >= 6) result = 'TD'
    else if (delta >= 3) result = 'FG'
    else if (endOfHalf) result = 'END_OF_HALF'
    else if (drive.lastKicked) result = 'PUNT'
    else result = 'TURNOVER'
    this.closedDrives.push({
      offense: drive.offense,
      plays: drive.plays,
      yards: drive.yards,
      startClock: drive.startClock,
      result,
    })
    this.drive = null
  }

  private startPlay(state: GameState) {
    const routes: Route[] = this.recordRoutes ? Array.from({ length: 11 }, (_, slot) => ({ slot, points: [] })) : []
    this.open = {
      start: snapshot(state),
      startClock: formatClock(state.clock),
      startScore: state.teams[state.offense].score,
      routes,
      sack: false,
      touchdown: false,
      kicked: false,
    }
    this.samplePlay(state)
  }

  private samplePlay(state: GameState) {
    const open = this.open
    if (!open) return
    if (state.sack) open.sack = true
    if (state.touchdown) open.touchdown = true
    if (state.kicked) open.kicked = true
    if (!state.live) return
    for (const route of open.routes) {
      const p = state.positions[open.start.offense * 11 + route.slot]
      if (p) route.points.push({ x: p.x, y: p.y })
    }
  }

  private finishPlay(state: GameState, events: TrackerEvent[]) {
    const open = this.open
    if (!open) return
    this.samplePlay(state)
    this.open = null
    const offense = open.start.offense
    const defense = offense === 0 ? 1 : 0
    const before = open.start.teams[offense]
    const after = state.teams[offense]
    const rushDelta = rushYards(after) - rushYards(before)
    const recDelta = recYards(after) - recYards(before)
    const interception = interceptions(state.teams[defense]) > interceptions(open.start.teams[defense])
    let yards = rushDelta + recDelta
    if (open.sack) {
      const gain = distanceFromP1Goal(state.ballOn) - distanceFromP1Goal(open.start.ballOn)
      yards = offense === 1 ? -gain : gain
    }
    if (rushDelta > this.longestRush[offense]) this.longestRush[offense] = rushDelta
    if (recDelta > this.longestRec[offense]) this.longestRec[offense] = recDelta

    const play: PlayResult = {
      index: this.playList.length,
      offense,
      quarter: open.start.quarter,
      yards,
      touchdown: open.touchdown,
      sack: open.sack,
      interception,
      kicked: open.kicked,
      routes: open.routes,
      summary: this.summarize(offense, before.players, after.players, yards, open, interception),
    }
    this.playList.push(play)
    this.recordDrive(play, open, state)
    events.push({ type: 'playEnd', play })
    for (const moment of this.momentsFor(play)) {
      this.momentList.push(moment)
      events.push({ type: 'bigMoment', moment })
    }
  }

  private recordDrive(play: PlayResult, open: OpenPlay, state: GameState) {
    const flipped = this.drive !== null && this.drive.offense !== play.offense
    if (this.drive && flipped) {
      this.drive.lastKicked = open.kicked
      this.closeDrive(state.teams[this.drive.offense].score, false)
    }
    if (open.kicked && (flipped || !this.drive)) return
    if (!this.drive) {
      this.drive = {
        offense: play.offense,
        plays: 0,
        yards: 0,
        startClock: open.startClock,
        startScore: open.startScore,
        lastKicked: false,
      }
    }
    this.drive.plays += 1
    this.drive.yards += play.yards
    this.drive.lastKicked = open.kicked
  }

  private momentsFor(play: PlayResult): BigMoment[] {
    const moments: BigMoment[] = []
    const add = (kind: BigMoment['kind']) => moments.push({ kind, play, text: play.summary })
    if (play.touchdown && play.yards >= LONG_TD_YARDS) add('LONG_TD')
    if (!play.touchdown && play.yards >= BIG_PLAY_YARDS) add('BIG_PLAY')
    if (play.sack) add('SACK')
    if (play.interception) add('INT')
    return moments
  }

  private summarize(
    offense: 0 | 1,
    before: PlayerStats[],
    after: PlayerStats[],
    yards: number,
    open: OpenPlay,
    interception: boolean,
  ): string {
    const name = (p: PlayerStats | undefined) => (p ? this.names(offense, p.rosterIndex) : '')
    const touchdownTail = open.touchdown ? ', TOUCHDOWN' : ''
    if (open.sack) return `SACK, ${yards} YDS${touchdownTail}`
    if (interception) return 'INTERCEPTED'
    let base: string
    const passer = findChange(before, after, (p) => p.pass?.att)
    const receiver = findChange(before, after, (p) => p.rec?.rec)
    const rusher = findChange(before, after, (p) => p.rush?.att)
    if (passer) {
      const head = name(passer) ? `${name(passer)} PASS` : 'PASS'
      if (receiver) base = `${head}${name(receiver) ? ` TO ${name(receiver)}` : ''}, ${yards} YDS`
      else base = `${head} INCOMPLETE`
    } else if (rusher) {
      base = `${name(rusher) ? `${name(rusher)} ` : ''}RUSH, ${yards} YDS`
    } else if (open.kicked) {
      base = 'KICK'
    } else {
      return open.touchdown ? 'TOUCHDOWN' : `PLAY, ${yards} YDS`
    }
    return `${base}${touchdownTail}`
  }
}
