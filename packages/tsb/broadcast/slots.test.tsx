import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { LEAD_IN_MS, type Emulator, type LeagueGame } from '@8bsn/sdk'
import { LeagueTicker, startLabel, leagueEntry, type Clip, renderStation, stubReplays, TAIL_MS } from '@8bsn/sdk/testing'
import { leagueDetail } from '../game/format'
import { PlayTracker, type PlayResult, type TrackerEvent } from '../game/playTracker'
import type { GameState } from '../game/types'
import type { Game } from '../game/useGame'
import type { Helmets } from '../helmets/useHelmets'
import tsb from '..'
import { BREAK_STATS_MS, BREAK_TAIL_MS } from './BreakScreen'
import { CLASH_CAP_MS, CLASH_FADE_MS, CLASH_MIN_MS } from './HelmetClash'
import { BAND_EXIT_MS, lineupMs } from './LowerTicker'
import { WIPE_EXIT_MS } from './ScoringWipe'
import { teamColor, teamColors } from './teamColors'
import css from './broadcast.css?raw'

const fed = vi.hoisted(() => ({ game: null as unknown, helmets: new Map() as ReadonlyMap<number, string> }))

vi.mock('../game/useGame', async (importOriginal) => ({ ...(await importOriginal<typeof import('../game/useGame')>()), useGame: () => fed.game }))
vi.mock('../helmets/useHelmets', () => ({ useHelmets: () => fed.helmets }))
stubReplays()

const clip: Clip = { from: 0, to: 10, state: new Uint8Array([1]), inputs: new Uint16Array(22), hashes: new Uint32Array(11) }

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  fed.helmets = new Map()
})

const player = () => ({ first: 'James', last: 'Cook', number: 28, position: 'RB' as const })
const NO_EVENTS: TrackerEvent[] = []

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    inGame: true,
    inBreak: false,
    live: false,
    playOver: false,
    touchdown: false,
    sack: false,
    kicked: false,
    thrown: false,
    call: null,
    playKind: 'scrimmage',
    isTry: false,
    quarter: 1,
    clock: { min: 3, sec: 12 },
    down: 3,
    yardsToGo: 4,
    ballOn: { yard: 30, side: 1 },
    offense: 0,
    possession: 0,
    teams: [
      { id: 0, abbr: 'BUF', name: 'BUF', city: '', score: 14, timeouts: 3, players: [] },
      { id: 1, abbr: 'MIA', name: 'MIA', city: '', score: 7, timeouts: 3, players: [] },
    ],
    playSelect: false,
    betweenPlays: false,
    carrier: null,
    carrierRoster: null,
    caught: false,
    touchback: false,
    outOfBounds: false,
    fumbled: false,
    kickCalled: false,
    intro: null,
    ballInAir: null,
    deflected: false,
    deflector: null,
    passTarget: null,
    field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
    positions: [],
    frame: 1,
    ...overrides,
  }
}

const game = (away: string, awayScore: number, home: string, homeScore: number, detail: string, state: LeagueGame['state'] = 'in'): LeagueGame => ({
  id: `${away}@${home}`,
  away: { abbr: away, score: awayScore },
  home: { abbr: home, score: homeScore },
  state,
  detail,
  date: '2026-10-18T17:00Z',
})

type Feed = { state: GameState | null; tracker: PlayTracker; events?: TrackerEvent[]; generation?: number; helmets?: Helmets }

function feed({ state, tracker, events = NO_EVENTS, generation = 0, helmets }: Feed) {
  const fresh: Game = { state, final: null, tracker, events, generation, names: () => '', player, sidecar: vi.fn(), restore: vi.fn(), suspend: vi.fn(), resume: vi.fn() }
  fed.game = fresh
  if (helmets) fed.helmets = helmets
}

function station(first: Feed, options: Parameters<typeof renderStation>[1] = {}) {
  feed(first)
  const result = renderStation(tsb, options)
  const show = (next: Feed, more: Parameters<typeof renderStation>[1] = {}) => {
    feed(next)
    result.rerender(more)
  }
  return { ...result, show }
}

test('off the field the view is not boxed and shows no scorebug', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  station({ state: makeState({ inGame: false }), tracker }, { forceWindow: true })
  expect(screen.getByTestId('bc-stage')).not.toHaveAttribute('data-phase', 'window')
  expect(screen.queryByTestId('scorebug')).toBeNull()
})

test('on the menus the league ticker shows under the game', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  station({ state: makeState({ inGame: false, inBreak: false }), tracker })
  expect(screen.getByTestId('bc-stage')).toHaveAttribute('data-phase', 'menus')
  expect(screen.getByTestId('region-ticker')).toBeVisible()
  expect(screen.getByTestId('around-the-league')).toBeVisible()
  expect(screen.queryByTestId('scorebug')).toBeNull()
})

test('the scorebug shows both scores, the clock and down and distance', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  station({ state: makeState({ live: true }), tracker })
  const bug = screen.getByTestId('scorebug')
  expect(bug).toHaveTextContent('BUF')
  expect(bug).toHaveTextContent('14')
  expect(bug).toHaveTextContent('MIA')
  expect(bug).toHaveTextContent('2ND 3:12')
  expect(bug).toHaveTextContent('3RD & 4')
})

test('AroundTheLeague renders one entry per game', () => {
  render(<LeagueTicker detail={leagueDetail} games={[game('KC', 24, 'BUF', 17, '4th 2:10'), game('SF', 31, 'SEA', 3, 'Final', 'post')]} />)
  const entries = screen.getAllByTestId('league-game')
  expect(entries).toHaveLength(2)
  expect(entries[0]).toHaveTextContent('KC 24 BUF 17 4Q 2:10')
  expect(entries[1]).toHaveTextContent('SF 31 SEA 3 FINAL')
})

test('upcoming games show their kickoff', () => {
  const upcoming = { ...game('GB', 0, 'DAL', 0, '10/18 - 8:20 PM EDT', 'pre'), date: '2026-10-19T00:20Z' }
  expect(startLabel(upcoming.date, 'America/New_York')).toBe('SUN 8:20 PM')
  expect(startLabel('2026-10-20T00:15Z', 'America/New_York')).toBe('MON 8:15 PM')
  expect(startLabel('nope')).toBe('')
  expect(leagueEntry(upcoming, 'America/New_York', leagueDetail)).toBe('GB AT DAL SUN 8:20 PM')
  render(<LeagueTicker detail={leagueDetail} games={[upcoming]} />)
  expect(screen.getAllByTestId('league-game')[0]).toHaveTextContent(/^GB AT DAL (SUN|MON) \d{1,2}:\d{2} (AM|PM)$/)
})

test('leagueEntry formats quarters, halftime and overtime finals', () => {
  expect(leagueEntry(game('PHI', 10, 'DAL', 13, 'Halftime'), undefined, leagueDetail)).toBe('PHI 10 DAL 13 HALF')
  expect(leagueEntry(game('NYG', 20, 'WSH', 23, 'Final/OT', 'post'), undefined, leagueDetail)).toBe('NYG 20 WSH 23 FINAL/OT')
  expect(leagueEntry(game('DEN', 0, 'LV', 7, '1st 9:45'), undefined, leagueDetail)).toBe('DEN 0 LV 7 1Q 9:45')
})

test('teamColors covers the ROM and ESPN abbreviations with a fallback', () => {
  for (const abbr of ['BUF', 'CLE', 'ARZ', 'ARI', 'WAS', 'WSH', 'LAR', 'JAX', 'KC', 'SF']) {
    expect(teamColors[abbr]).toBeDefined()
  }
  expect(teamColor('???')).toEqual({ primary: '#333', secondary: '#999' })
  expect(teamColor('ARZ')).toEqual(teamColor('ARI'))
})

test('the scorebug shows KICKOFF and the try instead of down and distance', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const { show } = station({ state: makeState({ live: true, playKind: 'kickoff', down: 1, yardsToGo: 0 }), tracker })
  expect(screen.getByTestId('scorebug')).toHaveTextContent('KICKOFF')
  expect(screen.getByTestId('scorebug')).not.toHaveTextContent('GOAL')
  show({ state: makeState({ live: true, isTry: true, down: 1, yardsToGo: 2 }), tracker })
  expect(screen.getByTestId('scorebug')).toHaveTextContent('2PT TRY')
  expect(screen.getByTestId('scorebug')).not.toHaveTextContent('1ST')
  show({ state: makeState({ live: true, playKind: 'extraPoint', isTry: true, down: 1, yardsToGo: 2 }), tracker })
  expect(screen.getByTestId('scorebug')).toHaveTextContent('PAT')
})

test('the scorebug ball marks the team holding the ball between plays', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const { container } = station({ state: makeState({ offense: 1, possession: 0 }), tracker })
  const teams = container.querySelectorAll('.bug-team')
  expect(teams[0].querySelector('.bug-ball')).not.toBeNull()
  expect(teams[1].querySelector('.bug-ball')).toBeNull()
})

test('during a break the view stays full size and the scorebug shows the scores and the break', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const halftime = makeState({ inGame: false, inBreak: true, quarter: 2, clock: { min: 0, sec: 0 } })
  station({ state: halftime, tracker })
  expect(screen.getByTestId('bc-stage')).not.toHaveAttribute('data-phase', 'window')
  const bug = screen.getByTestId('scorebug')
  expect(bug).toHaveTextContent('14')
  expect(bug).toHaveTextContent('2ND 0:00')
  expect(bug).toHaveTextContent('HALFTIME')
})

test('the package shows the league games passed in', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  station({ state: makeState(), tracker }, { games: [game('BUF', 20, 'MIA', 17, 'Final', 'post')] })
  expect(screen.getByTestId('around-the-league')).toHaveTextContent('BUF 20')
})

test('the scorebug shows each team helmet when one is known', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const state = makeState({ live: true })
  const helmets = new Map([[state.teams[0].id, 'blob:helmet-a']])
  station({ state, tracker, helmets })
  const imgs = screen.getAllByTestId('bug-helmet')
  expect(imgs).toHaveLength(1)
  expect(imgs[0]).toHaveAttribute('src', 'blob:helmet-a')
})

test('the possession football follows the helmet and the team name', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const state = makeState({ live: true, possession: 0 })
  const helmets = new Map([[state.teams[0].id, 'blob:helmet-a']])
  station({ state, tracker, helmets })
  const ball = screen.getByTestId('bug-ball')
  expect(ball.compareDocumentPosition(screen.getByTestId('bug-helmet')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  expect(ball.closest('.bug-abbr')?.textContent).toBe(state.teams[0].abbr)
})

const touchdown: PlayResult = {
  index: 0,
  offense: 0,
  quarter: 1,
  yards: 30,
  touchdown: true,
  sack: false,
  interception: false,
  kicked: false,
  thrown: false,
  call: null,
  scramble: false,
  kind: 'scrimmage',
  isTry: false,
  routes: [],
  ball: [],
  field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
  summary: 'COOK RUSH, 30 YDS, TOUCHDOWN',
  startFrame: 100,
  endFrame: 400,
  down: 1,
  toGo: 10,
  startBallOn: { yard: 30, side: 1 },
  scoreBefore: [14, 7],
  scoreAfter: [20, 7],
  tracks: { frames: [], players: [] },
  people: {},
  pass: null,
  airYards: null,
  yac: null,
  fumble: null,
  kickResult: null,
  returner: null,
  returnYards: null,
}

test('the score panels start on the score, hold until the PAT screen, and the replay follows them', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  const tracker = new PlayTracker({ recordRoutes: false })
  const emulator = { clip: async () => clip } as unknown as Emulator
  const rom = new Uint8Array([1])
  const scored = (score: number, extra: Partial<GameState> = {}) => {
    const s = makeState(extra)
    s.teams[0].score = score
    return s
  }
  const wait = (ms: number) =>
    act(async () => {
      vi.advanceTimersByTime(ms)
    })
  const { show } = station({ state: scored(14), tracker }, { emulator, rom, canvasSlot: vi.fn() })
  show({ state: scored(20, { playOver: true }), tracker })
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  expect(screen.getByTestId('bug-score-0')).toHaveTextContent('14')
  await wait(1000)
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  expect(screen.getByTestId('bug-score-0')).toHaveTextContent('14')
  const ended: TrackerEvent[] = [{ type: 'playEnd', play: touchdown }]
  show({ state: scored(20, { betweenPlays: true }), tracker, events: ended })
  await wait(20000)
  expect(screen.getByTestId('scoring-wipe')).not.toHaveClass('wipe-leaving')
  show({ state: scored(20, { betweenPlays: true, isTry: true }), tracker, events: ended })
  const pkg = screen.getByTestId('bc-stage')
  expect(screen.getByTestId('scoring-wipe')).toHaveClass('wipe-leaving')
  expect(pkg).toHaveClass('covered')
  expect(screen.queryByTestId('replay-stage')).toBeNull()
  expect(screen.getByTestId('bug-score-0')).toHaveTextContent('14')
  expect(screen.queryByTestId('replay-stage')).toBeNull()
  expect(pkg).toHaveClass('covered')
  await wait(WIPE_EXIT_MS)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  expect(screen.getByTestId('bug-score-0')).toHaveTextContent('20')
  await wait(1)
  expect(screen.getByTestId('replay-lead-in')).toBeInTheDocument()
  await wait(LEAD_IN_MS)
  expect(screen.getByTestId('replay-stage')).toBeInTheDocument()
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace' }))
  })
  expect(screen.queryByTestId('replay-stage')).toBeNull()
  expect(pkg).not.toHaveClass('covered')
})

test('the scorebug shows the new score once the score panels close', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  const tracker = new PlayTracker({ recordRoutes: false })
  const emulator = { clip: async () => clip } as unknown as Emulator
  const rom = new Uint8Array([1])
  const state = (score: number) => {
    const s = makeState({ playOver: true })
    s.teams[0].score = score
    return s
  }
  const { show } = station({ state: state(14), tracker }, { emulator, rom, canvasSlot: vi.fn() })
  show({ state: state(20), tracker, events: [{ type: 'playEnd', play: touchdown }] })
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  await act(async () => {
    vi.advanceTimersByTime(6000)
  })
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  expect(screen.getByTestId('bug-score-0')).toHaveTextContent('14')
  const boxed = state(20)
  boxed.betweenPlays = true
  boxed.isTry = true
  boxed.playOver = false
  show({ state: boxed, tracker, events: [{ type: 'playEnd', play: touchdown }] })
  await act(async () => {
    vi.advanceTimersByTime(WIPE_EXIT_MS)
  })
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  expect(screen.getByTestId('bug-score-0')).toHaveTextContent('20')
})

test('the shoulder buttons do nothing while the game is full size', async () => {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  let pads: Gamepad[] = []
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads })
  const held = (...buttons: number[]) => [{ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })) } as unknown as Gamepad]
  const press = (...buttons: number[]) => {
    pads = held(...buttons)
    act(() => {
      for (const tick of frames.splice(0)) tick(0)
    })
    pads = held()
    act(() => {
      for (const tick of frames.splice(0)) tick(0)
    })
  }
  const tracker = new PlayTracker({ recordRoutes: false })
  vi.spyOn(tracker, 'plays').mockReturnValue([touchdown])
  const state = (playSelect: boolean) => {
    const s = makeState({ playSelect })
    s.teams[0].players = [{ rosterIndex: 1, rush: { att: 11, yds: 74, td: 1 } }, { rosterIndex: 2, rec: { rec: 4, yds: 51, td: 0 } }]
    return s
  }
  const emulator = { clip: async () => clip } as unknown as Emulator
  const rom = new Uint8Array([1])
  const { show } = station({ state: state(false), tracker }, { emulator, rom, canvasSlot: vi.fn() })
  press(5)
  press(7)
  expect(frames).toHaveLength(0)
  expect(screen.getByTestId('bc-stage')).not.toHaveClass('covered')
  show({ state: state(true), tracker })
  expect(screen.getByTestId('stats-rushing')).toBeInTheDocument()
  press(5)
  expect(screen.getByTestId('stats-receiving')).toBeInTheDocument()
  press(4)
  expect(screen.getByTestId('stats-rushing')).toBeInTheDocument()
  expect(screen.queryByTestId('replay-stage')).toBeNull()
  press(7)
  expect(screen.getByTestId('bc-stage')).toHaveClass('covered')
  await act(async () => {
    await Promise.resolve()
  })
  expect(screen.getByTestId('replay-stage')).toHaveClass('replay-lead-in')
  expect(screen.getByTestId('bc-stage')).toHaveClass('covered')
  press(5)
  press(6)
  press(7)
  expect(screen.queryByTestId('replay-stage')).toBeNull()
  expect(screen.getByTestId('stats-rushing')).toBeInTheDocument()
  show({ state: state(false), tracker })
  press(5)
  show({ state: state(true), tracker })
  expect(screen.getByTestId('stats-rushing')).toBeInTheDocument()
  vi.unstubAllGlobals()
})

test('a lineup takes the league ticker band during play select and the league returns after', () => {
  vi.useFakeTimers()
  const tracker = new PlayTracker({ recordRoutes: false })
  const games = [game('KC', 7, 'DEN', 3, '2nd 4:00')]
  const { show } = station({ state: makeState({ playSelect: true }), tracker, events: [] }, { games, canvasSlot: vi.fn() })
  const root = screen.getByTestId('bc-stage')
  expect(root).toHaveAttribute('data-phase', 'window')
  expect(screen.getByTestId('around-the-league')).toBeInTheDocument()
  const players = Array.from({ length: 11 }, (_, i) => ({ entry: i, role: 'QB', rosterIndex: i }))
  show({ state: makeState({ playSelect: true }), tracker, events: [{ type: 'lineup', lineup: { team: 0, unit: 'offense', players } }] })
  expect(screen.getByTestId('lower-ticker-title')).toHaveTextContent('BUF OFFENSE')
  expect(screen.queryByTestId('around-the-league')).toBeNull()
  expect(root.className).toBe('bc-stage')
  const wait = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  wait(lineupMs(11))
  expect(screen.getByTestId('lower-ticker')).toHaveClass('lower-ticker-leaving')
  expect(screen.queryByTestId('around-the-league')).toBeNull()
  wait(BAND_EXIT_MS)
  expect(screen.queryByTestId('lower-ticker')).toBeNull()
  expect(screen.getByTestId('around-the-league')).toHaveClass('league league-enter')
  wait(BAND_EXIT_MS)
  expect(screen.getByTestId('around-the-league')).not.toHaveClass('league-enter')
})

test('the band fades without moving when reduced motion is asked for', () => {
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  expect(reduced).toMatch(/\.lower-ticker \{\s*animation-name: band-fade-in;/)
  expect(reduced).toMatch(/\.lower-ticker-leaving \{\s*animation-name: band-fade-out;/)
  const fades = css.slice(css.indexOf('@keyframes band-fade-in'), css.indexOf('@media (prefers-reduced-motion: reduce)'))
  expect(fades).not.toContain('transform')
})

function rule(css: string, selector: string): string {
  const at = css.indexOf(`\n${selector} {`)
  return css.slice(at, css.indexOf('}', at))
}

test('the scorebug sits on the boxed game edge property', () => {
  expect(rule(css, '.scorebug')).toMatch(/left: calc\(var\(--box-left\) \* 1cqw\);/)
})

test('the halftime screen covers the stage and pauses the live game until a key closes it', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const emulator = { pause: vi.fn(), resume: vi.fn(), clip: vi.fn(async () => clip) } as unknown as Emulator
  const { show } = station({ state: makeState({ quarter: 1 }), tracker }, { emulator, rom: new Uint8Array([1]) })
  expect(screen.queryByTestId('break-screen')).toBeNull()
  show({ state: makeState({ inGame: false, inBreak: true, quarter: 2, clock: { min: 0, sec: 0 } }), tracker })
  expect(screen.getByTestId('break-screen')).toHaveTextContent('HALFTIME')
  expect(emulator.pause).toHaveBeenCalledTimes(1)
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }))
  })
  expect(screen.queryByTestId('break-screen')).toBeNull()
  expect(emulator.resume).toHaveBeenCalledTimes(1)
})

test('after the final the aftershow covers the stage, and in tailgate closing it starts the next game', () => {
  vi.useFakeTimers()
  const tracker = new PlayTracker({ recordRoutes: false })
  const emulator = { pause: vi.fn(), resume: vi.fn(), clip: vi.fn(async () => clip), autoplay: vi.fn(), setHumanInput: vi.fn(), setAutoInput: vi.fn(), readSnapshot: () => false } as unknown as Emulator
  const onTailgateFinal = vi.fn()
  const final = makeState({ inGame: false, inBreak: true, quarter: 4, clock: { min: 0, sec: 0 } })
  feed({ state: makeState({ inGame: false }), tracker })
  fed.game = { ...(fed.game as Game), final }
  renderStation(tsb, { emulator, rom: new Uint8Array([1]), tailgate: true, onTailgateFinal })
  expect(screen.getByTestId('break-title')).toHaveTextContent('AFTERSHOW')
  expect(screen.getAllByTestId('break-screen')).toHaveLength(1)
  expect(emulator.pause).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(BREAK_STATS_MS))
  act(() => vi.advanceTimersByTime(BREAK_TAIL_MS))
  expect(screen.queryByTestId('break-screen')).toBeNull()
  expect(onTailgateFinal).toHaveBeenCalledTimes(1)
})

test('in tailgate mode the game holds at play select for the last play graphic plus a second', () => {
  vi.useFakeTimers()
  const tracker = new PlayTracker({ recordRoutes: false })
  const emulator = { pause: vi.fn(), resume: vi.fn() } as unknown as Emulator
  const { show } = station({ state: makeState({ live: true }), tracker }, { emulator, tailgate: true })
  show({ state: makeState({ betweenPlays: true }), tracker })
  expect(emulator.pause).not.toHaveBeenCalled()
  show({ state: makeState({ playSelect: true }), tracker })
  expect(emulator.pause).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(TAIL_MS - 1))
  expect(emulator.resume).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(emulator.resume).toHaveBeenCalledTimes(1)
  show({ state: makeState({ live: true }), tracker })
  expect(emulator.resume).toHaveBeenCalledTimes(1)
  vi.useRealTimers()
})

test('helmets clash over the PRESEASON card and matchup with the game running, then open like doors as the coin toss appears', () => {
  vi.useFakeTimers()
  const tracker = new PlayTracker({ recordRoutes: false })
  const emulator = { pause: vi.fn(), resume: vi.fn() } as unknown as Emulator
  const helmets = new Map([[makeState().teams[0].id, 'data:image/png;base64,AA==']])
  const { show } = station({ state: makeState({ inGame: false }), tracker, helmets }, { emulator })
  expect(screen.queryByTestId('helmet-clash')).toBeNull()
  show({ state: makeState({ inGame: false, intro: 'card' }), tracker })
  const clash = screen.getByTestId('helmet-clash')
  expect(clash).toHaveTextContent('BUF')
  expect(clash).toHaveTextContent('MIA')
  expect(screen.getAllByTestId('clash-helmet')).toHaveLength(1)
  expect(emulator.pause).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(2000))
  show({ state: makeState({ inGame: false, intro: 'matchup' }), tracker })
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.getByTestId('helmet-clash')).not.toHaveClass('clash-leaving')
  show({ state: makeState({ inGame: false, intro: null }), tracker })
  act(() => vi.advanceTimersByTime(500))
  expect(screen.getByTestId('helmet-clash')).not.toHaveClass('clash-leaving')
  show({ state: makeState({ inGame: false, intro: 'coinToss' }), tracker })
  act(() => vi.advanceTimersByTime(0))
  expect(screen.getByTestId('helmet-clash')).toHaveClass('clash-leaving')
  act(() => vi.advanceTimersByTime(CLASH_FADE_MS))
  expect(screen.queryByTestId('helmet-clash')).toBeNull()
  vi.useRealTimers()
})

test('the clash holds a few seconds even if the coin toss comes right away, and never past its cap', () => {
  vi.useFakeTimers()
  const tracker = new PlayTracker({ recordRoutes: false })
  const { show } = station({ state: makeState({ inGame: false }), tracker })
  show({ state: makeState({ inGame: false, intro: 'card' }), tracker })
  show({ state: makeState({ inGame: false, intro: 'coinToss' }), tracker })
  act(() => vi.advanceTimersByTime(CLASH_MIN_MS - 1))
  expect(screen.getByTestId('helmet-clash')).not.toHaveClass('clash-leaving')
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByTestId('helmet-clash')).toHaveClass('clash-leaving')
  act(() => vi.advanceTimersByTime(CLASH_FADE_MS))
  show({ state: makeState({ inGame: false }), tracker })
  show({ state: makeState({ inGame: false, intro: 'card' }), tracker })
  act(() => vi.advanceTimersByTime(CLASH_CAP_MS))
  expect(screen.getByTestId('helmet-clash')).toHaveClass('clash-leaving')
  vi.useRealTimers()
})

test('under each helmet is the city, the team name and its record from the ESPN standings', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const base = makeState({ inGame: false })
  const teams: GameState['teams'] = [
    { ...base.teams[0], abbr: 'WAS', city: 'Washington', name: 'Commanders' },
    { ...base.teams[1], abbr: 'MIA', city: 'Miami', name: 'Dolphins' },
  ]
  const records = new Map([['WSH', '3-3']])
  const { show } = station({ state: { ...base, teams }, tracker }, { records })
  show({ state: { ...base, teams, intro: 'card' }, tracker })
  const [was, mia] = screen.getAllByTestId('clash-team')
  expect(was).toHaveTextContent('WashingtonCommanders3-3')
  expect(mia).toHaveTextContent('MiamiDolphins')
  expect(screen.getAllByTestId('clash-record')).toHaveLength(1)
})

test('loading a save state on the PRESEASON card does not set off the clash', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const { show } = station({ state: makeState({ inGame: false }), tracker, generation: 0 })
  show({ state: makeState({ inGame: false, intro: 'card' }), tracker, generation: 1 })
  expect(screen.queryByTestId('helmet-clash')).toBeNull()
})

test('the helmet flight names its keyframes in the shorthand so the minifier keeps its timing', () => {
  expect(css).toMatch(/\.clash-half-0 \.clash-hit \{[^}]*animation: clash-fly-left 1400ms linear both;/)
  expect(css).toMatch(/\.clash-half-1 \.clash-hit \{[^}]*animation: clash-fly-right 1400ms linear both;/)
  expect(css).not.toMatch(/\n\.clash-hit \{\n\s*animation: \d/)
})
