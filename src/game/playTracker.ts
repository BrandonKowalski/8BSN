import { formatClock } from './format'
import type { GameState, PlayCall, PlayerStats, PlayKind, TeamState } from './types'

export type Route = { slot: number; points: { x: number; y: number }[] }
export type BallPoint = { x: number; y: number; slot: number }
export type Tracks = { frames: number[]; players: { x: number; y: number }[][] }
export type People = { passer?: number; receiver?: number; rusher?: number; defender?: { team: 0 | 1; rosterIndex: number; kind: 'sack' | 'int' } }
export type PassOutcome = 'caught' | 'incomplete' | 'deflected' | 'intercepted'
export type Pass = {
  from: { x: number; y: number }
  to: { x: number; y: number }
  outcome: PassOutcome
  by?: { team: 0 | 1; rosterIndex: number }
  frames?: [number, number]
}
export type Who = { team: 0 | 1; rosterIndex: number }
export type Fumble = {
  at: { x: number; y: number }
  frame: number
  index: number
  by: Who | null
  recoveredBy: Who | null
  recovery: { slot: number; frame: number; index: number } | null
  lost: boolean
}
export type PlayResult = {
  index: number
  offense: 0 | 1
  quarter: number
  yards: number
  touchdown: boolean
  sack: boolean
  interception: boolean
  kicked: boolean
  thrown: boolean
  call: PlayCall | null
  scramble: boolean
  kind: PlayKind
  isTry: boolean
  routes: Route[]
  ball: BallPoint[]
  field: GameState['field']
  summary: string
  startFrame: number
  endFrame: number
  down: number
  toGo: number
  startBallOn: GameState['ballOn']
  scoreBefore: [number, number]
  scoreAfter: [number, number]
  tracks: Tracks
  people: People
  pass: Pass | null
  airYards: number | null
  yac: number | null
  fumble: Fumble | null
}
export type DriveResult = 'TD' | 'FG' | 'PUNT' | 'INT' | 'FUMBLE' | 'MISSED_FG' | 'DOWNS' | 'END_OF_HALF' | 'IN_PROGRESS'
export type Drive = {
  offense: 0 | 1
  plays: number
  yards: number
  startClock: string
  result: DriveResult
  startSpot: GameState['ballOn']
  endSpot: GameState['ballOn']
  endSummary: string
  endTime: string
}
export type BigMoment = { kind: 'LONG_TD' | 'BIG_PLAY' | 'SACK' | 'INT'; play: PlayResult; text: string }
export type TrackerEvent =
  | { type: 'snap' }
  | { type: 'playOver' }
  | { type: 'playEnd'; play: PlayResult }
  | { type: 'bigMoment'; moment: BigMoment }

type Names = (team: 0 | 1, rosterIndex: number) => string
type Snapshot = {
  teams: [TeamState, TeamState]
  ballOn: GameState['ballOn']
  field: GameState['field']
  offense: 0 | 1
  quarter: number
  kind: PlayKind
  call: PlayCall | null
  isTry: boolean
  down: number
  toGo: number
  frame: number
  snapCarrier: number | null
}
type Closing = { frame: number; stats: string }
type Flight = {
  from: { x: number; y: number }
  to: { x: number; y: number }
  frames: [number, number]
  done: boolean
  deflected: boolean
  by: { team: 0 | 1; rosterIndex: number } | null
}
type OpenPlay = {
  start: Snapshot
  startClock: string
  startScore: number
  startElapsed: number
  routes: Route[]
  ball: BallPoint[]
  tracks: Tracks
  sack: boolean
  touchdown: boolean
  kicked: boolean
  thrown: boolean
  fumbled: boolean
  runner: { x: number; rosterIndex: number | null } | null
  flight: Flight | null
  fumble: (Omit<Fumble, 'lost'> & { slot: number }) | null
  closing: Closing | null
}
type OpenDrive = {
  offense: 0 | 1
  plays: number
  yards: number
  startClock: string
  startScore: number
  lastPunt: boolean
  period: number
  startSpot: GameState['ballOn']
  endSpot: GameState['ballOn']
  endSummary: string
  lastInterception: boolean
  startElapsed: number
  endElapsed: number
}
export type TrackerSidecar = {
  open: OpenPlay | null
  plays: PlayResult[]
  closedDrives: Drive[]
  drive: OpenDrive | null
  moments: BigMoment[]
  possession: [number, number]
  longestRush: [number, number]
  longestRec: [number, number]
  prevClock: number | null
}

const BIG_PLAY_YARDS = 25
const LONG_TD_YARDS = 40
const CLOSING_FRAME_CAP = 900
const UNITS_PER_YARD = 8
const SIDE_SLOTS = 11

const teamOf = (slot: number): 0 | 1 => (slot < SIDE_SLOTS ? 0 : 1)

const period = (quarter: number) => (quarter < 2 ? 0 : quarter < 4 ? 1 : 2)

const statsKey = (teams: [TeamState, TeamState]) => JSON.stringify([teams[0].players, teams[1].players])

const sum = (players: PlayerStats[], pick: (p: PlayerStats) => number | undefined) =>
  players.reduce((total, p) => total + (pick(p) ?? 0), 0)

const rushYards = (team: TeamState) => sum(team.players, (p) => p.rush?.yds)
const recYards = (team: TeamState) => sum(team.players, (p) => p.rec?.yds)
const interceptions = (team: TeamState) => sum(team.players, (p) => p.def?.int)

const snapshot = (state: GameState): Snapshot => ({
  teams: JSON.parse(JSON.stringify(state.teams)) as [TeamState, TeamState],
  ballOn: { ...state.ballOn },
  field: { ...state.field },
  offense: state.offense,
  quarter: state.quarter,
  kind: state.playKind,
  call: state.call,
  isTry: state.isTry,
  down: state.down,
  toGo: state.yardsToGo,
  frame: state.frame,
  snapCarrier: state.carrier !== null && Math.floor(state.carrier / SIDE_SLOTS) === state.offense ? state.carrierRoster : null,
})

const KICKS: readonly PlayKind[] = ['kickoff', 'punt', 'fieldGoal', 'extraPoint']


const distanceFromP1Goal = (ballOn: GameState['ballOn']) =>
  ballOn.side === 0 ? ballOn.yard : ballOn.side === 1 ? 100 - ballOn.yard : 50

const spotAt = (distance: number): GameState['ballOn'] => {
  const d = Math.min(100, Math.max(0, distance))
  return d === 50 ? { yard: 50, side: null } : d < 50 ? { yard: d, side: 0 } : { yard: 100 - d, side: 1 }
}

const advance = (ballOn: GameState['ballOn'], offense: 0 | 1, yards: number) =>
  spotAt(distanceFromP1Goal(ballOn) + (offense === 0 ? yards : -yards))

const formatElapsed = (seconds: number) => formatClock({ min: Math.floor(seconds / 60), sec: seconds % 60 })

const scores = (teams: [TeamState, TeamState]): [number, number] => [teams[0].score, teams[1].score]

const findChange = (
  before: PlayerStats[],
  after: PlayerStats[],
  pick: (p: PlayerStats) => number | undefined,
): PlayerStats | undefined =>
  after.find((p) => {
    const prior = before.find((b) => b.rosterIndex === p.rosterIndex)
    return (pick(p) ?? 0) > (prior ? pick(prior) ?? 0 : 0)
  })

function splitYards(pass: Pass | null, people: People, field: GameState['field'], yards: number, touchdown: boolean) {
  if (pass?.outcome !== 'caught' || people.receiver === undefined) return { airYards: null, yac: null }
  const thrown = Math.round(((field.attacksHigh ? 1 : -1) * (pass.to.x - field.losX)) / UNITS_PER_YARD) || 0
  const airYards = touchdown ? Math.min(thrown, yards) : thrown
  return { airYards, yac: yards - airYards }
}

const isScramble = (open: OpenPlay, people: People) =>
  open.start.call === 'pass' &&
  !open.thrown &&
  !open.sack &&
  people.passer === undefined &&
  people.rusher !== undefined &&
  people.rusher === open.start.snapCarrier

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

  constructor(opts: { recordRoutes: boolean; names?: Names }) {
    this.recordRoutes = opts.recordRoutes
    this.names = opts.names ?? (() => '')
  }

  push(state: GameState): TrackerEvent[] {
    const events: TrackerEvent[] = []
    if (!state.inGame) {
      const closing = this.open?.closing
      if (state.inBreak && closing && statsKey(state.teams) !== closing.stats) this.finishPlay(state, events)
      return events
    }
    this.trackClock(state)
    if (!this.open) this.closeDriveIfNeeded(state)
    const open = this.open
    if (open && !open.closing) {
      if (state.live) {
        this.samplePlay(state)
      } else {
        this.markBits(state)
        open.closing = { frame: state.frame, stats: statsKey(state.teams) }
        events.push({ type: 'playOver' })
        if (!state.playOver) this.finishPlay(state, events)
      }
    } else if (open && open.closing) {
      this.markBits(state)
      const settled =
        statsKey(state.teams) !== open.closing.stats ||
        !state.playOver ||
        state.frame - open.closing.frame >= CLOSING_FRAME_CAP
      if (settled) this.finishPlay(state, events)
    } else if (state.live && !state.playOver) {
      this.startPlay(state)
      events.push({ type: 'snap' })
    }
    return events
  }

  sidecar(): TrackerSidecar {
    return structuredClone({
      open: this.open,
      plays: this.playList,
      closedDrives: this.closedDrives,
      drive: this.drive,
      moments: this.momentList,
      possession: this.possession,
      longestRush: this.longestRush,
      longestRec: this.longestRec,
      prevClock: this.prevClock,
    })
  }

  restore(sidecar: TrackerSidecar): void {
    const copy = structuredClone(sidecar)
    this.open = copy.open
    this.playList = copy.plays
    this.closedDrives = copy.closedDrives
    this.drive = copy.drive
    this.momentList = copy.moments
    this.possession = copy.possession
    this.longestRush = copy.longestRush
    this.longestRec = copy.longestRec
    this.prevClock = copy.prevClock
  }

  reset(): void {
    this.open = null
    this.playList = []
    this.closedDrives = []
    this.drive = null
    this.momentList = []
    this.possession = [0, 0]
    this.longestRush = [0, 0]
    this.longestRec = [0, 0]
    this.prevClock = null
  }

  plays(): readonly PlayResult[] {
    return this.playList
  }

  latestPlay(): PlayResult | null {
    const open = this.open
    if (open?.closing) {
      return {
        index: this.playList.length,
        offense: open.start.offense,
        quarter: open.start.quarter,
        yards: 0,
        touchdown: open.touchdown,
        sack: open.sack,
        interception: false,
        kicked: open.kicked,
        thrown: open.thrown,
        call: open.start.call,
        scramble: false,
        kind: open.start.kind,
        isTry: open.start.isTry,
        routes: open.routes,
        ball: open.ball,
        field: open.start.field,
        summary: '',
        startFrame: open.start.frame,
        endFrame: open.closing.frame,
        down: open.start.down,
        toGo: open.start.toGo,
        startBallOn: open.start.ballOn,
        scoreBefore: scores(open.start.teams),
        scoreAfter: scores(open.start.teams),
        tracks: open.tracks,
        people: {},
        pass: this.passOf(open, {}, false),
        airYards: null,
        yac: null,
        fumble: this.fumbleOf(open),
      }
    }
    return this.playList[this.playList.length - 1] ?? null
  }

  drives(): readonly Drive[] {
    if (!this.drive) return this.closedDrives
    return [...this.closedDrives, this.driveOf(this.drive, 'IN_PROGRESS')]
  }

  lastDrive(): Drive | null {
    return this.closedDrives[this.closedDrives.length - 1] ?? null
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

  private elapsed() {
    return this.possession[0] + this.possession[1]
  }

  private driveOf(drive: OpenDrive, result: DriveResult): Drive {
    return {
      offense: drive.offense,
      plays: drive.plays,
      yards: drive.yards,
      startClock: drive.startClock,
      result,
      startSpot: drive.startSpot,
      endSpot: drive.endSpot,
      endSummary: drive.endSummary,
      endTime: formatElapsed(drive.endElapsed - drive.startElapsed),
    }
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
    const halfEnded = period(state.quarter) !== this.drive.period
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
    else if (drive.lastPunt) result = 'PUNT'
    else if (drive.lastInterception) result = 'INT'
    else if (drive.endSummary === 'FUMBLE LOST') result = 'FUMBLE'
    else if (drive.endSummary === 'FIELD GOAL NO GOOD') result = 'MISSED_FG'
    else result = 'DOWNS'
    this.closedDrives.push(this.driveOf(drive, result))
    this.drive = null
  }

  private startPlay(state: GameState) {
    const routes: Route[] = this.recordRoutes ? Array.from({ length: 11 }, (_, slot) => ({ slot, points: [] })) : []
    this.open = {
      start: snapshot(state),
      startClock: formatClock(state.clock),
      startScore: state.teams[state.offense].score,
      startElapsed: this.elapsed(),
      routes,
      ball: [],
      tracks: { frames: [], players: [] },
      sack: false,
      touchdown: false,
      kicked: KICKS.includes(state.playKind),
      thrown: false,
      fumbled: false,
      runner: null,
      flight: null,
      fumble: null,
      closing: null,
    }
    this.samplePlay(state)
  }

  private markBits(state: GameState) {
    const open = this.open
    if (!open) return
    if (state.sack) open.sack = true
    if (state.touchdown) open.touchdown = true
    if (state.kicked) open.kicked = true
    if (state.thrown) open.thrown = true
    if (state.fumbled) open.fumbled = true
  }

  private samplePlay(state: GameState) {
    const open = this.open
    if (!open) return
    this.markBits(state)
    for (const route of open.routes) {
      const p = state.positions[open.start.offense * 11 + route.slot]
      if (p) route.points.push({ x: p.x, y: p.y })
    }
    const carrier = state.carrier === null ? undefined : state.positions[state.carrier]
    const offenseSlot = state.carrier !== null && Math.floor(state.carrier / SIDE_SLOTS) === open.start.offense
    if (carrier && offenseSlot) open.runner = { x: carrier.x, rosterIndex: state.carrierRoster }
    this.sampleFlight(state)
    this.sampleFumble(state)
    if (this.recordRoutes && carrier && state.carrier !== null) open.ball.push({ x: carrier.x, y: carrier.y, slot: state.carrier })
    if (this.recordRoutes) {
      open.tracks.frames.push(state.frame)
      open.tracks.players.push(state.positions.map((p) => ({ x: p.x, y: p.y })))
    }
  }

  private sampleFlight(state: GameState) {
    const open = this.open
    if (!open || !state.thrown || open.flight?.done) return
    const ball = state.ballInAir
    if (!open.flight) {
      if (!ball) return
      open.flight = { from: { ...ball }, to: { ...ball }, frames: [state.frame, state.frame], done: false, deflected: false, by: null }
    }
    const flight = open.flight
    if (ball) {
      flight.to = { ...ball }
      flight.frames[1] = state.frame
    }
    if (state.deflected) {
      flight.done = true
      flight.deflected = true
      const who = state.deflector
      if (who && who.rosterIndex !== null) flight.by = { team: teamOf(who.slot), rosterIndex: who.rosterIndex }
    } else if (!ball) {
      flight.done = true
    }
  }

  private sampleFumble(state: GameState) {
    const open = this.open
    const slot = state.carrier
    if (!open || slot === null || open.start.kind !== 'scrimmage' || open.start.isTry) return
    const who = (): Who | null => (state.carrierRoster === null ? null : { team: teamOf(slot), rosterIndex: state.carrierRoster })
    const fumble = open.fumble ?? null
    if (!fumble) {
      if (!state.fumbled) return
      const at = state.positions[slot]
      if (!at) return
      open.fumble = { at: { x: at.x, y: at.y }, frame: state.frame, index: open.ball.length, by: who(), slot, recoveredBy: null, recovery: null }
      return
    }
    if (fumble.recovery || (state.fumbled && teamOf(slot) === teamOf(fumble.slot))) return
    fumble.recovery = { slot, frame: state.frame, index: open.ball.length }
    fumble.recoveredBy = who()
  }

  private fumbleOf(open: OpenPlay): Fumble | null {
    const fumble = open.fumble ?? null
    if (!fumble) return null
    const { at, frame, index, by, recoveredBy, recovery } = fumble
    return structuredClone({ at, frame, index, by, recoveredBy, recovery, lost: recovery !== null && teamOf(recovery.slot) !== open.start.offense })
  }

  private passOf(open: OpenPlay, people: People, interception: boolean): Pass | null {
    const flight = open.flight
    if (!flight || !open.thrown) return null
    const offense = open.start.offense
    const thrower = open.ball[0]?.slot
    const next = open.ball.find((p) => p.slot !== thrower)
    const picked = interception || (next !== undefined && teamOf(next.slot) !== offense)
    const caught = people.receiver !== undefined || next !== undefined
    const outcome: PassOutcome = picked ? 'intercepted' : caught ? 'caught' : flight.deflected ? 'deflected' : 'incomplete'
    const pass: Pass = { from: { ...flight.from }, to: { ...flight.to }, outcome, frames: [flight.frames[0], flight.frames[1]] }
    if (outcome === 'deflected' && flight.by) pass.by = { ...flight.by }
    return pass
  }

  private finishPlay(state: GameState, events: TrackerEvent[]) {
    const open = this.open
    if (!open) return
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
    const people = this.peopleOf(offense, open.start.teams, state.teams)
    const runner = this.uncreditedRunner(open, people, interception, state)
    let rushed = rushDelta
    if (runner) {
      yards = runner.yards
      rushed = runner.yards
      if (runner.rosterIndex !== null) people.rusher = runner.rosterIndex
    }
    if (rushed > this.longestRush[offense]) this.longestRush[offense] = rushed
    if (recDelta > this.longestRec[offense]) this.longestRec[offense] = recDelta

    const pass = this.passOf(open, people, interception)
    const scramble = isScramble(open, people)
    const play: PlayResult = {
      index: this.playList.length,
      offense,
      quarter: open.start.quarter,
      yards,
      touchdown: open.touchdown,
      sack: open.sack,
      interception,
      kicked: open.kicked,
      thrown: open.thrown,
      call: open.start.call,
      scramble,
      kind: open.start.kind,
      isTry: open.start.isTry,
      routes: open.routes,
      ball: open.ball,
      field: open.start.field,
      summary: this.summarize(offense, people, yards, open, interception, state, runner !== null, scramble),
      startFrame: open.start.frame,
      endFrame: open.closing?.frame ?? state.frame,
      down: open.start.down,
      toGo: open.start.toGo,
      startBallOn: open.start.ballOn,
      scoreBefore: scores(open.start.teams),
      scoreAfter: scores(state.teams),
      tracks: open.tracks,
      people,
      pass,
      ...splitYards(pass, people, open.start.field, yards, open.touchdown),
      fumble: this.fumbleOf(open),
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
    if (play.isTry) return
    const flipped = this.drive !== null && this.drive.offense !== play.offense
    if (this.drive && flipped) {
      this.drive.lastPunt = play.kind === 'punt'
      this.closeDrive(state.teams[this.drive.offense].score, false)
    }
    if (play.kind === 'kickoff' || (play.kicked && (flipped || !this.drive))) return
    if (!this.drive) {
      this.drive = {
        offense: play.offense,
        plays: 0,
        yards: 0,
        startClock: open.startClock,
        startScore: open.startScore,
        lastPunt: false,
        period: period(play.quarter),
        startSpot: play.startBallOn,
        endSpot: play.startBallOn,
        endSummary: '',
        lastInterception: false,
        startElapsed: open.startElapsed,
        endElapsed: open.startElapsed,
      }
    }
    this.drive.plays += 1
    this.drive.yards += play.yards
    this.drive.lastPunt = play.kind === 'punt'
    this.drive.endSpot = advance(play.startBallOn, play.offense, play.yards)
    this.drive.endSummary = play.summary
    this.drive.lastInterception = play.interception
    this.drive.endElapsed = this.elapsed()
  }

  private uncreditedRunner(open: OpenPlay, people: People, interception: boolean, state: GameState) {
    const offense = open.start.offense
    const credited = people.passer !== undefined || people.receiver !== undefined || people.rusher !== undefined
    const runner = open.runner
    if (!runner || credited || interception || open.sack || open.start.isTry || open.start.kind !== 'scrimmage') return null
    if (state.possession !== offense) return null
    const { losX, attacksHigh } = open.start.field
    const yards = Math.trunc(((attacksHigh ? 1 : -1) * (runner.x - losX)) / UNITS_PER_YARD) || 0
    return { yards, rosterIndex: runner.rosterIndex }
  }

  private peopleOf(offense: 0 | 1, before: [TeamState, TeamState], after: [TeamState, TeamState]): People {
    const defense = offense === 0 ? 1 : 0
    const change = (team: 0 | 1, pick: (p: PlayerStats) => number | undefined) =>
      findChange(before[team].players, after[team].players, pick)?.rosterIndex
    const people: People = {}
    const passer = change(offense, (p) => p.pass?.att)
    const receiver = change(offense, (p) => p.rec?.rec)
    const rusher = change(offense, (p) => p.rush?.att)
    if (passer !== undefined) people.passer = passer
    if (receiver !== undefined) people.receiver = receiver
    if (rusher !== undefined) people.rusher = rusher
    const sacker = change(defense, (p) => p.def?.sacks)
    const picker = change(defense, (p) => p.def?.int)
    if (picker !== undefined) people.defender = { team: defense, rosterIndex: picker, kind: 'int' }
    else if (sacker !== undefined) people.defender = { team: defense, rosterIndex: sacker, kind: 'sack' }
    return people
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
    people: People,
    yards: number,
    open: OpenPlay,
    interception: boolean,
    state: GameState,
    uncredited: boolean,
    scramble: boolean,
  ): string {
    const scored = state.teams[offense].score > open.startScore
    if (open.start.isTry || open.start.kind === 'extraPoint') return scored ? 'PAT GOOD' : 'PAT NO GOOD'
    if (open.start.kind === 'fieldGoal') return scored ? 'FIELD GOAL GOOD' : 'FIELD GOAL NO GOOD'
    const name = (rosterIndex: number | undefined) => (rosterIndex === undefined ? '' : this.names(offense, rosterIndex))
    const touchdownTail = open.touchdown ? ', TOUCHDOWN' : ''
    if (open.sack) return `SACK, ${yards} YDS${touchdownTail}`
    if (interception) return 'INTERCEPTED'
    const fumbleLost =
      open.start.kind === 'scrimmage' && state.possession !== offense && statsKey(state.teams) === statsKey(open.start.teams)
    if (fumbleLost) return 'FUMBLE LOST'
    let base: string
    const { passer, receiver, rusher } = people
    if (passer !== undefined) {
      const head = name(passer) ? `${name(passer)} PASS` : 'PASS'
      if (receiver !== undefined) base = `${head}${name(receiver) ? ` TO ${name(receiver)}` : ''}, ${yards} YDS`
      else base = `${head} INCOMPLETE`
    } else if (rusher !== undefined) {
      base = `${name(rusher) ? `${name(rusher)} ` : ''}${scramble ? 'SCRAMBLE' : 'RUSH'}, ${yards} YDS`
    } else if (uncredited) {
      base = `${state.teams[offense].abbr} RUN, ${yards} YDS`
    } else if (open.kicked) {
      base = open.start.kind === 'punt' ? 'PUNT' : open.start.kind === 'kickoff' ? 'KICKOFF' : 'KICK'
    } else {
      return open.touchdown ? 'TOUCHDOWN' : `PLAY, ${yards} YDS`
    }
    const fumbleTail = uncredited && open.fumbled ? ', FUMBLE' : ''
    return `${base}${fumbleTail}${touchdownTail}`
  }
}
