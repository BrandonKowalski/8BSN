import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { loadReplayFixture, replaySnapshots } from '../../../tools/replayFixture'
import type { Emulator } from '../../emu/Emulator'
import type { Clip } from '../../emu/recorder'
import { ReplayPlayer, type ReplayEnd } from '../../emu/ReplayPlayer'
import { decodeGameState } from '../../game/decode'
import { TSB2026_MAP } from '../../game/maps/tsb2026'
import { PlayTracker, type Drive, type PlayResult } from '../../game/playTracker'
import type { RosterTeam } from '../../game/roster'
import { teamComparison } from '../../game/teamStats'
import { Btn } from '../../input/buttons'
import { KeyboardInput } from '../../input/keyboard'
import type { GameState } from '../../game/types'
import BreakScreen, { BREAK_STATS_MS, BREAK_TAIL_MS, breakTitle } from './BreakScreen'
import { LEAD_IN_MS } from './replay/ReplayLeadIn'
import { REPLAY_HOLD_MS } from './replay/useReplay'
import { teamColor } from './teamColors'

vi.mock('../../emu/ReplayPlayer', () => ({ ReplayPlayer: { start: vi.fn() } }))

class FakePlayer {
  readonly from = 0
  private listeners: ((reason: ReplayEnd) => void)[] = []
  readonly stop = vi.fn(() => this.end('stopped'))
  setGate() {}
  finish() {}
  readSnapshot() {
    return false
  }
  onEnd(listener: (reason: ReplayEnd) => void) {
    this.listeners.push(listener)
    return () => undefined
  }
  end(reason: ReplayEnd) {
    const listeners = this.listeners
    this.listeners = []
    for (const listener of listeners) listener(reason)
  }
}

const clip: Clip = { from: 0, to: 10, state: new Uint8Array([1]), inputs: new Uint16Array(22), hashes: new Uint32Array(11) }
const rom = new Uint8Array([9])
const start = vi.mocked(ReplayPlayer.start)
const player = () => ({ first: 'James', last: 'Cook', number: 28, position: 'RB' as const })

let players: FakePlayer[] = []
let missing = new Set<number>()
let pads: (Gamepad | null)[] = []
let frames: FrameRequestCallback[] = []

const makeEmulator = () =>
  ({
    pause: vi.fn(),
    resume: vi.fn(),
    clip: vi.fn(async (from: number) => (missing.has(from) ? null : clip)),
  }) as unknown as Emulator & { pause: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn>; clip: ReturnType<typeof vi.fn> }

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
    clock: { min: 0, sec: 4 },
    down: 1,
    yardsToGo: 10,
    ballOn: { yard: 30, side: 1 },
    offense: 0,
    possession: 0,
    teams: [
      { id: 0, abbr: 'BUF', name: 'BUF', score: 14, timeouts: 3, players: [] },
      { id: 1, abbr: 'MIA', name: 'MIA', score: 7, timeouts: 3, players: [] },
    ],
    playSelect: false,
    betweenPlays: false,
    carrier: null,
    carrierRoster: null,
    caught: false,
    touchback: false,
    outOfBounds: false,
    fumbled: false,
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

const atBreak = (quarter: number, overrides: Partial<GameState> = {}) => makeState({ inGame: false, inBreak: true, quarter, clock: { min: 0, sec: 0 }, ...overrides })

const play = (overrides: Partial<PlayResult>): PlayResult => ({
  index: 0,
  offense: 0,
  quarter: 0,
  yards: 3,
  touchdown: false,
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
  summary: 'RUSH, 3 YDS',
  startFrame: 100,
  endFrame: 400,
  down: 1,
  toGo: 10,
  startBallOn: { yard: 25, side: 0 },
  scoreBefore: [0, 0],
  scoreAfter: [0, 0],
  tracks: { frames: [], players: [] },
  people: {},
  pass: null,
  airYards: null,
  yac: null,
  fumble: null,
  kickResult: null,
  returner: null,
  returnYards: null,
  ...overrides,
})

const stub = (plays: PlayResult[]) => ({ plays: () => plays, drives: () => [], timeOfPossession: () => [0, 0] }) as unknown as PlayTracker

const highlightPlays = [
  play({ index: 0, quarter: 0, touchdown: true, yards: 13, summary: 'PASS, 13 YDS, TOUCHDOWN', startFrame: 1000 }),
  play({ index: 1, quarter: 1, yards: 3, startFrame: 2000 }),
  play({ index: 2, quarter: 1, sack: true, yards: -7, summary: 'SACK, -7 YDS', startFrame: 3000 }),
  play({ index: 3, quarter: 1, yards: 25, summary: 'RUSH, 25 YDS', startFrame: 4000 }),
  play({ index: 4, quarter: 2, touchdown: true, yards: 40, summary: 'RUSH, 40 YDS, TOUCHDOWN', startFrame: 5000 }),
]

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })

const wait = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms)
  })

const tick = () =>
  act(() => {
    const due = frames
    frames = []
    for (const cb of due) cb(0)
  })

const pad = (pressed: number[]) => ({ buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) }) as unknown as Gamepad

beforeEach(() => {
  players = []
  missing = new Set()
  pads = []
  frames = []
  start.mockReset()
  start.mockImplementation(async () => {
    const replay = new FakePlayer()
    players.push(replay)
    return replay as unknown as ReplayPlayer
  })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads })
})

afterEach(() => {
  window.dispatchEvent(new Event('blur'))
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const fakeTeam = (id: number, abbr: string): RosterTeam => ({
  id,
  abbr,
  city: abbr,
  name: abbr,
  players: Array.from({ length: 30 }, (_, i) => ({ first: '', last: `${abbr}${i}`, number: i, position: 'QB' as const })),
})

function firstHalf() {
  const fixture = loadReplayFixture('tests/fixtures/tsb2026/replay-game-a.json.gz')
  const roster = [fakeTeam(0, 'BUF'), fakeTeam(5, 'CLE')]
  const tracker = new PlayTracker({ recordRoutes: true })
  let last: GameState | null = null
  for (const window of fixture.windows) {
    for (const snap of replaySnapshots(fixture, window.name)) {
      const state = decodeGameState(snap, TSB2026_MAP, roster)
      tracker.push(state)
      if (state.inBreak && state.quarter === 2 && last) return { tracker, last, halftime: state }
      if (state.inGame) last = state
    }
  }
  throw new Error('no halftime in the fixture')
}

test('halftime compares the teams and charts the first half drives', () => {
  const { tracker, last, halftime } = firstHalf()
  const emulator = makeEmulator()
  const helmets = new Map([
    [0, 'data:image/png;base64,AAAA'],
    [5, 'data:image/png;base64,BBBB'],
  ])
  const view = render(<BreakScreen state={last} tracker={tracker} player={player} helmets={helmets} emulator={emulator} rom={rom} />)
  expect(screen.queryByTestId('break-screen')).toBeNull()
  view.rerender(<BreakScreen state={halftime} tracker={tracker} player={player} helmets={helmets} emulator={emulator} rom={rom} />)
  const shown = screen.getByTestId('break-screen')
  expect(screen.getByTestId('break-title')).toHaveTextContent('HALFTIME')
  expect(screen.getByTestId('break-score-0')).toHaveTextContent('2')
  expect(screen.getByTestId('break-score-1')).toHaveTextContent('6')
  expect(within(shown).getAllByTestId('break-helmet').map((img) => img.getAttribute('src'))).toEqual(['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB'])
  expect(within(shown).getByRole('img', { name: '8BSN' })).toBeInTheDocument()

  const expected = teamComparison(tracker.plays(), tracker.drives(), halftime, tracker.timeOfPossession())
  const rows = screen.getAllByTestId('break-row')
  expect(rows.map((row) => row.textContent)).toEqual(expected.map((r) => `${r.values[0]}${r.label}${r.values[1]}`))
  rows.forEach((row, i) => {
    const cells = within(row).getAllByTestId('break-value')
    expect(cells.map((c) => c.classList.contains('break-leader'))).toEqual([expected[i].leader === 0, expected[i].leader === 1])
  })
  expect(expected.some((r) => r.leader !== null)).toBe(true)

  const drives = screen.getAllByTestId('break-drive')
  expect(drives.map((d) => within(d).getByTestId('break-drive-team').textContent)).toEqual(['BUF', 'CLE', 'CLE', 'BUF', 'BUF', 'CLE', 'BUF'])
  expect(drives.map((d) => within(d).getByTestId('break-drive-word').textContent)).toEqual(['PUNT', 'TOUCHDOWN', 'DOWNS', 'FUMBLE', 'DOWNS', 'INTERCEPTION', 'END OF HALF'])
  const bar = within(drives[0]).getByTestId('break-drive-bar')
  expect(parseFloat(bar.style.left)).toBeCloseTo((32 / 120) * 100)
  expect(parseFloat(bar.style.width)).toBeCloseTo((5 / 120) * 100)
  expect(bar.style.backgroundColor).toBe(hexToRgb(teamColor('BUF').primary))
  expect(within(drives[1]).getByTestId('break-drive-bar').style.backgroundColor).toBe(hexToRgb(teamColor('CLE').primary))
  expect(emulator.pause).toHaveBeenCalledTimes(1)
})

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

test('the leader of each comparison row reads in yellow', () => {
  const css = readFileSync('src/views/broadcast/broadcast.css', 'utf8')
  expect(css).toMatch(/\.break-leader \{\s*color: #ffd400;/)
})

test('the live game is paused while the screen is up and resumes on a button', () => {
  const emulator = makeEmulator()
  const tracker = stub([])
  const props = { tracker, player, helmets: new Map(), emulator, rom }
  const view = render(<BreakScreen state={makeState()} {...props} />)
  expect(emulator.pause).not.toHaveBeenCalled()
  view.rerender(<BreakScreen state={atBreak(2)} {...props} />)
  expect(screen.getByTestId('break-screen')).toBeInTheDocument()
  expect(emulator.pause).toHaveBeenCalledTimes(1)
  expect(emulator.resume).not.toHaveBeenCalled()
  fireEvent.keyDown(window, { code: 'KeyX' })
  expect(screen.queryByTestId('break-screen')).toBeNull()
  expect(emulator.resume).toHaveBeenCalledTimes(1)
  view.rerender(<BreakScreen state={atBreak(2, { frame: 2 })} {...props} />)
  expect(screen.queryByTestId('break-screen')).toBeNull()
  expect(emulator.pause).toHaveBeenCalledTimes(1)
})

test('a pad button closes the screen on its rising edge', () => {
  const emulator = makeEmulator()
  const onClose = vi.fn()
  const props = { tracker: stub([]), player, helmets: new Map(), emulator, rom, onClose }
  pads = [pad([0])]
  const view = render(<BreakScreen state={makeState()} {...props} />)
  view.rerender(<BreakScreen state={atBreak(2)} {...props} />)
  tick()
  tick()
  expect(screen.getByTestId('break-screen')).toBeInTheDocument()
  pads = [pad([])]
  tick()
  pads = [pad([3])]
  tick()
  expect(screen.queryByTestId('break-screen')).toBeNull()
  expect(emulator.resume).toHaveBeenCalledTimes(1)
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('a break with no plays shows zeros and no reel', async () => {
  const emulator = makeEmulator()
  const tracker = new PlayTracker({ recordRoutes: false })
  const zero = { teams: [makeState().teams[0], makeState().teams[1]].map((t) => ({ ...t, score: 0 })) as GameState['teams'] }
  const props = { tracker, player, helmets: new Map(), emulator, rom }
  const view = render(<BreakScreen state={makeState(zero)} {...props} />)
  view.rerender(<BreakScreen state={atBreak(2, zero)} {...props} />)
  expect(screen.getByTestId('break-score-0')).toHaveTextContent('0')
  expect(screen.getByTestId('break-score-1')).toHaveTextContent('0')
  expect(screen.getAllByTestId('break-row').map((row) => row.textContent)).toEqual([
    '0TOTAL YDS0',
    '0RUSH YDS0',
    '0PASS YDS0',
    '0 OF 03RD DOWN0 OF 0',
    '0 OF 0RED ZONE0 OF 0',
    '0TURNOVERS0',
    '0:00POSSESSION0:00',
  ])
  expect(document.querySelectorAll('.break-leader')).toHaveLength(0)
  expect(screen.queryAllByTestId('break-drive')).toHaveLength(0)
  await wait(BREAK_STATS_MS)
  await flush()
  expect(screen.queryByTestId('break-reel')).toBeNull()
  expect(screen.queryByTestId('replay-stage')).toBeNull()
  expect(emulator.clip).not.toHaveBeenCalled()
  expect(screen.getByTestId('break-screen')).toBeInTheDocument()
  fireEvent.keyDown(window, { code: 'Space' })
  expect(screen.queryByTestId('break-screen')).toBeNull()
  expect(emulator.resume).toHaveBeenCalledTimes(1)
})

test('the reel plays every highlight of the half in order, skips a missing clip and closes five seconds after its end', async () => {
  const emulator = makeEmulator()
  missing = new Set([3000])
  const onClose = vi.fn()
  const props = { tracker: stub(highlightPlays), player, helmets: new Map(), emulator, rom, onClose }
  const view = render(<BreakScreen state={makeState()} {...props} />)
  view.rerender(<BreakScreen state={atBreak(2)} {...props} />)
  await wait(BREAK_STATS_MS - 1)
  expect(screen.queryByTestId('break-reel')).toBeNull()
  await wait(1)
  await flush()
  expect(screen.getByTestId('break-reel-count')).toHaveTextContent('HIGHLIGHT 1 OF 3')
  expect(screen.getByTestId('replay-lead-in')).toHaveTextContent('FIRST HALF HIGHLIGHTS')
  await wait(LEAD_IN_MS)
  await flush()
  expect(players).toHaveLength(1)
  expect(screen.getByTestId('replay-stage')).toBeInTheDocument()
  act(() => players[0].end('done'))
  await wait(REPLAY_HOLD_MS)
  await flush()
  expect(screen.getByTestId('break-reel-count')).toHaveTextContent('HIGHLIGHT 3 OF 3')
  await wait(LEAD_IN_MS)
  await flush()
  expect(players).toHaveLength(2)
  expect(emulator.clip.mock.calls.map(([from]) => from)).toEqual([1000, 3000, 4000])
  act(() => players[1].end('done'))
  await wait(REPLAY_HOLD_MS)
  await flush()
  expect(screen.queryByTestId('break-reel')).toBeNull()
  expect(screen.getByTestId('break-title')).toHaveTextContent('HALFTIME')
  expect(emulator.resume).not.toHaveBeenCalled()
  await wait(BREAK_TAIL_MS)
  expect(screen.queryByTestId('break-screen')).toBeNull()
  expect(emulator.resume).toHaveBeenCalledTimes(1)
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('the final screen covers the whole game and other breaks show nothing', async () => {
  const emulator = makeEmulator()
  const props = { tracker: stub(highlightPlays), player, helmets: new Map(), emulator, rom }
  const view = render(<BreakScreen state={makeState({ quarter: 0 })} {...props} />)
  view.rerender(<BreakScreen state={atBreak(1)} {...props} />)
  expect(screen.queryByTestId('break-screen')).toBeNull()
  const tied = { teams: makeState().teams.map((t) => ({ ...t, score: 10 })) as GameState['teams'] }
  view.rerender(<BreakScreen state={makeState({ quarter: 3, ...tied })} {...props} />)
  view.rerender(<BreakScreen state={atBreak(3, tied)} {...props} />)
  view.rerender(<BreakScreen state={atBreak(4, tied)} {...props} />)
  expect(screen.queryByTestId('break-screen')).toBeNull()
  expect(emulator.pause).not.toHaveBeenCalled()
  view.rerender(<BreakScreen state={makeState({ quarter: 3 })} {...props} />)
  view.rerender(<BreakScreen state={atBreak(3)} {...props} />)
  expect(screen.getByTestId('break-title')).toHaveTextContent('FINAL')
  await wait(BREAK_STATS_MS)
  await flush()
  expect(screen.getByTestId('break-reel-count')).toHaveTextContent('HIGHLIGHT 1 OF 4')
  expect(screen.getByTestId('replay-lead-in')).toHaveTextContent('GAME HIGHLIGHTS')
})

test('a break with no known last quarter shows no title rather than a guess', () => {
  expect(breakTitle(atBreak(2), null)).toBeNull()
  expect(breakTitle(atBreak(2), 1)).toBe('HALFTIME')
  expect(breakTitle(atBreak(4), 3)).toBe('FINAL')
  expect(breakTitle(atBreak(4, { teams: makeState().teams.map((t) => ({ ...t, score: 3 })) as GameState['teams'] }), 3)).toBeNull()
})

test('a drive still open at the break whose last play lost a fumble charts FUMBLE from the play, not its summary', () => {
  const drive: Drive = { offense: 0, plays: 1, yards: 3, startClock: '1:00', result: 'IN_PROGRESS', startSpot: { yard: 25, side: 0 }, endSpot: { yard: 28, side: 0 }, endSummary: '', endTime: '0:00' }
  const fumble = { at: { x: 0, y: 0 }, frame: 300, index: 1, by: null, recoveredBy: null, recovery: { slot: 12, frame: 310, index: 2 }, lost: true }
  const chart = (last: PlayResult) => {
    cleanup()
    const tracker = { plays: () => [last], drives: () => [drive], timeOfPossession: () => [0, 0] } as unknown as PlayTracker
    const props = { tracker, player, helmets: new Map(), emulator: makeEmulator(), rom }
    const view = render(<BreakScreen state={makeState()} {...props} />)
    view.rerender(<BreakScreen state={atBreak(2)} {...props} />)
    return screen.getByTestId('break-drive-word').textContent
  }
  expect(chart(play({ summary: 'COOK RUSH, 3 YDS, FUMBLE', fumble }))).toBe('FUMBLE')
  expect(chart(play({ summary: 'FUMBLE LOST' }))).toBe('END OF HALF')
})

test('closing the screen ignores modifier chords and typing, and the closing key reaches nothing else', () => {
  const emulator = makeEmulator()
  const props = { tracker: stub([]), player, helmets: new Map(), emulator, rom }
  const view = render(<BreakScreen state={makeState()} {...props} />)
  view.rerender(<BreakScreen state={atBreak(2)} {...props} />)
  const others = vi.fn()
  window.addEventListener('keydown', others)
  fireEvent.keyDown(window, { code: 'KeyR', metaKey: true })
  fireEvent.keyDown(window, { code: 'KeyR', ctrlKey: true })
  fireEvent.keyDown(window, { code: 'KeyR', altKey: true })
  const input = document.createElement('input')
  document.body.appendChild(input)
  fireEvent.keyDown(input, { code: 'KeyR' })
  input.remove()
  expect(screen.getByTestId('break-screen')).toBeInTheDocument()
  expect(others).toHaveBeenCalledTimes(4)
  fireEvent.keyDown(window, { code: 'KeyR' })
  expect(screen.queryByTestId('break-screen')).toBeNull()
  expect(others).toHaveBeenCalledTimes(4)
  expect(emulator.resume).toHaveBeenCalledTimes(1)
  fireEvent.keyUp(window, { code: 'KeyR' })
  fireEvent.keyDown(window, { code: 'KeyR' })
  expect(others).toHaveBeenCalledTimes(5)
  window.removeEventListener('keydown', others)
})

test('holding the closing key sends nothing to the game until it is released', () => {
  const emulator = makeEmulator()
  const masks = vi.fn()
  const game = new KeyboardInput(window, masks)
  const props = { tracker: stub([]), player, helmets: new Map(), emulator, rom }
  const view = render(<BreakScreen state={makeState()} {...props} />)
  view.rerender(<BreakScreen state={atBreak(2)} {...props} />)
  fireEvent.keyDown(window, { code: 'KeyX' })
  expect(screen.queryByTestId('break-screen')).toBeNull()
  fireEvent.keyDown(window, { code: 'KeyX', repeat: true })
  fireEvent.keyDown(window, { code: 'KeyX', repeat: true })
  expect(masks).not.toHaveBeenCalled()
  fireEvent.keyUp(window, { code: 'KeyX' })
  fireEvent.keyDown(window, { code: 'KeyX' })
  expect(masks).toHaveBeenLastCalledWith([Btn.A, 0])
  game.dispose()
})
