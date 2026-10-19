import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Emulator } from '../../emu/Emulator'
import type { Clip } from '../../emu/recorder'
import { PlayTracker, type PlayResult, type TrackerEvent } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import type { LeagueGame } from '../../league/espn'
import AroundTheLeague, { kickoffLabel, leagueEntry } from './AroundTheLeague'
import BroadcastView, { packageVisible } from './BroadcastView'
import { WIPE_EXIT_MS, WIPE_MIN_MS } from './ScoringWipe'
import { LEAD_IN_MS } from './replay/ReplayLeadIn'
import { teamColor, teamColors } from './teamColors'
import { BAND_EXIT_MS, lineupMs } from './LowerTicker'
import { readFileSync } from 'node:fs'

vi.mock('../../emu/ReplayPlayer', () => ({ ReplayPlayer: { start: () => new Promise(() => undefined) } }))

const clip: Clip = { from: 0, to: 10, state: new Uint8Array([1]), inputs: new Uint16Array(22), hashes: new Uint32Array(11) }

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const player = () => ({ first: 'James', last: 'Cook', number: 28, position: 'RB' as const })

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

const game = (away: string, awayScore: number, home: string, homeScore: number, detail: string, state: LeagueGame['state'] = 'in'): LeagueGame => ({
  id: `${away}@${home}`,
  away: { abbr: away, score: awayScore },
  home: { abbr: home, score: homeScore },
  state,
  detail,
  date: '2026-10-18T17:00Z',
})

test('packageVisible is false off the field regardless of live or force', () => {
  expect(packageVisible(null, true, true)).toBe(false)
  expect(packageVisible(null, true, false)).toBe(false)
  expect(packageVisible(makeState({ inGame: false }), true, true)).toBe(false)
  expect(packageVisible(makeState({ inGame: false }), true, false)).toBe(false)
})

test('packageVisible with live detection follows the play select screen and ignores force', () => {
  expect(packageVisible(makeState({ playSelect: true }), false, true)).toBe(true)
  expect(packageVisible(makeState({ playSelect: false }), false, true)).toBe(false)
  expect(packageVisible(makeState({ playSelect: true }), true, true)).toBe(true)
  expect(packageVisible(makeState({ playSelect: false }), true, true)).toBe(false)
})

test('the game stays full size after a play, at kickoff and before the snap until play select shows', () => {
  expect(packageVisible(makeState({ playOver: true }), false, true)).toBe(false)
  expect(packageVisible(makeState({ playKind: 'kickoff' }), false, true)).toBe(false)
  expect(packageVisible(makeState({ live: false, playSelect: false }), false, true)).toBe(false)
})

test('packageVisible without live detection equals forcePackage', () => {
  expect(packageVisible(makeState({ live: false }), false, false)).toBe(false)
  expect(packageVisible(makeState({ live: true }), false, false)).toBe(false)
  expect(packageVisible(makeState({ live: false }), true, false)).toBe(true)
  expect(packageVisible(makeState({ live: true }), true, false)).toBe(true)
})

test('the view is boxed on the play select screen and unboxed the instant it closes', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const slot = vi.fn()
  const { rerender } = render(<BroadcastView state={makeState({ playSelect: true })} tracker={tracker} player={player} forcePackage={false} canvasSlot={slot} games={null} />)
  const view = screen.getByTestId('broadcast-view')
  expect(view).toHaveClass('boxed')
  expect(screen.getByTestId('stats-package')).toBeVisible()
  rerender(<BroadcastView state={makeState({ playSelect: false })} tracker={tracker} player={player} forcePackage={false} canvasSlot={slot} games={null} />)
  expect(view).not.toHaveClass('boxed')
  expect(screen.getByTestId('stats-package')).not.toBeVisible()
})

test('the canvas slot element survives boxing and unboxing', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const slot = vi.fn()
  const { rerender } = render(<BroadcastView state={makeState({ live: true })} tracker={tracker} player={player} forcePackage={false} canvasSlot={slot} games={null} />)
  rerender(<BroadcastView state={makeState({ playSelect: true })} tracker={tracker} player={player} forcePackage={false} canvasSlot={slot} games={null} />)
  rerender(<BroadcastView state={makeState({ live: true })} tracker={tracker} player={player} forcePackage={false} canvasSlot={slot} games={null} />)
  expect(slot.mock.calls.filter(([node]) => node === null)).toHaveLength(0)
})

test('off the field the view is not boxed and shows no scorebug', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  render(<BroadcastView state={makeState({ inGame: false })} tracker={tracker} player={player} forcePackage={true} canvasSlot={() => undefined} games={null} />)
  expect(screen.getByTestId('broadcast-view')).not.toHaveClass('boxed')
  expect(screen.queryByTestId('scorebug')).toBeNull()
})

test('the scorebug shows both scores, the clock and down and distance', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  render(<BroadcastView state={makeState({ live: true })} tracker={tracker} player={player} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  const bug = screen.getByTestId('scorebug')
  expect(bug).toHaveTextContent('BUF')
  expect(bug).toHaveTextContent('14')
  expect(bug).toHaveTextContent('MIA')
  expect(bug).toHaveTextContent('2ND 3:12')
  expect(bug).toHaveTextContent('3RD & 4')
})

test('AroundTheLeague keeps a network band up for null or no games', () => {
  const { rerender } = render(<AroundTheLeague games={null} />)
  expect(screen.getByTestId('around-the-league')).toHaveTextContent('8-BIT SPORTS NETWORK')
  expect(screen.getByTestId('around-the-league').querySelector('.wordmark')).not.toBeNull()
  expect(screen.queryByTestId('league-game')).toBeNull()
  rerender(<AroundTheLeague games={[]} entering />)
  expect(screen.getByTestId('around-the-league')).toHaveTextContent('8-BIT SPORTS NETWORK')
  expect(screen.getByTestId('around-the-league')).toHaveClass('league-enter')
})

test('AroundTheLeague renders one entry per game', () => {
  render(<AroundTheLeague games={[game('KC', 24, 'BUF', 17, '4th 2:10'), game('SF', 31, 'SEA', 3, 'Final', 'post')]} />)
  const entries = screen.getAllByTestId('league-game')
  expect(entries).toHaveLength(2)
  expect(entries[0]).toHaveTextContent('KC 24 BUF 17 4Q 2:10')
  expect(entries[1]).toHaveTextContent('SF 31 SEA 3 FINAL')
})

test('the wordmark sits at the right end of the league ticker', () => {
  render(<AroundTheLeague games={[game('KC', 24, 'BUF', 17, '4th 2:10')]} />)
  const ticker = screen.getByTestId('around-the-league')
  const mark = ticker.querySelector('.wordmark')
  const roll = ticker.querySelector('.league-roll')!
  expect(mark).not.toBeNull()
  expect(roll.contains(mark)).toBe(false)
  expect(ticker.lastElementChild!.contains(mark)).toBe(true)
  expect(roll.compareDocumentPosition(mark!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('upcoming games show their kickoff', () => {
  const upcoming = { ...game('GB', 0, 'DAL', 0, '10/18 - 8:20 PM EDT', 'pre'), date: '2026-10-19T00:20Z' }
  expect(kickoffLabel(upcoming.date, 'America/New_York')).toBe('SUN 8:20 PM')
  expect(kickoffLabel('2026-10-20T00:15Z', 'America/New_York')).toBe('MON 8:15 PM')
  expect(kickoffLabel('nope')).toBe('')
  expect(leagueEntry(upcoming, 'America/New_York')).toBe('GB AT DAL SUN 8:20 PM')
  render(<AroundTheLeague games={[upcoming]} />)
  expect(screen.getAllByTestId('league-game')[0]).toHaveTextContent(/^GB AT DAL (SUN|MON) \d{1,2}:\d{2} (AM|PM)$/)
})

test('leagueEntry formats quarters, halftime and overtime finals', () => {
  expect(leagueEntry(game('PHI', 10, 'DAL', 13, 'Halftime'))).toBe('PHI 10 DAL 13 HALF')
  expect(leagueEntry(game('NYG', 20, 'WSH', 23, 'Final/OT', 'post'))).toBe('NYG 20 WSH 23 FINAL/OT')
  expect(leagueEntry(game('DEN', 0, 'LV', 7, '1st 9:45'))).toBe('DEN 0 LV 7 1Q 9:45')
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
  const { rerender } = render(<BroadcastView state={makeState({ live: true, playKind: 'kickoff', down: 1, yardsToGo: 0 })} tracker={tracker} player={player} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  expect(screen.getByTestId('scorebug')).toHaveTextContent('KICKOFF')
  expect(screen.getByTestId('scorebug')).not.toHaveTextContent('GOAL')
  rerender(<BroadcastView state={makeState({ live: true, isTry: true, down: 1, yardsToGo: 2 })} tracker={tracker} player={player} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  expect(screen.getByTestId('scorebug')).toHaveTextContent('2PT TRY')
  expect(screen.getByTestId('scorebug')).not.toHaveTextContent('1ST')
  rerender(<BroadcastView state={makeState({ live: true, playKind: 'extraPoint', isTry: true, down: 1, yardsToGo: 2 })} tracker={tracker} player={player} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  expect(screen.getByTestId('scorebug')).toHaveTextContent('PAT')
})

test('the scorebug ball marks the team holding the ball between plays', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const { container } = render(<BroadcastView state={makeState({ offense: 1, possession: 0 })} tracker={tracker} player={player} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  const teams = container.querySelectorAll('.bug-team')
  expect(teams[0].querySelector('.bug-ball')).not.toBeNull()
  expect(teams[1].querySelector('.bug-ball')).toBeNull()
})

test('during a break the view stays full size and the scorebug shows the scores and the break', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const halftime = makeState({ inGame: false, inBreak: true, quarter: 2, clock: { min: 0, sec: 0 } })
  render(<BroadcastView state={halftime} tracker={tracker} player={player} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  expect(screen.getByTestId('broadcast-view')).not.toHaveClass('boxed')
  const bug = screen.getByTestId('scorebug')
  expect(bug).toHaveTextContent('14')
  expect(bug).toHaveTextContent('2ND 0:00')
  expect(bug).toHaveTextContent('HALFTIME')
})

test('the package shows the league games passed in', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  render(<BroadcastView state={makeState()} tracker={tracker} player={player} forcePackage={false} canvasSlot={() => undefined} games={[game('BUF', 20, 'MIA', 17, 'Final', 'post')]} />)
  expect(screen.getByTestId('around-the-league')).toHaveTextContent('BUF 20')
})

test('the box comes in on the black lead-in, holds through play select and leaves when select closes even if the punt formation keeps the status clear', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const view = (state: GameState) => <BroadcastView state={state} tracker={tracker} player={player} forcePackage={false} canvasSlot={() => undefined} games={null} />
  const { rerender } = render(view(makeState({ playOver: true })))
  const el = screen.getByTestId('broadcast-view')
  expect(el).not.toHaveClass('boxed')
  rerender(view(makeState({ betweenPlays: true })))
  expect(el).toHaveClass('boxed')
  rerender(view(makeState({ betweenPlays: true, playSelect: true })))
  expect(el).toHaveClass('boxed')
  rerender(view(makeState({ betweenPlays: true })))
  expect(el).not.toHaveClass('boxed')
  rerender(view(makeState({ live: true })))
  expect(el).not.toHaveClass('boxed')
  rerender(view(makeState({ betweenPlays: true })))
  expect(el).toHaveClass('boxed')
})

test('packageVisible boxes the lead-in only before play select has shown', () => {
  expect(packageVisible(makeState({ betweenPlays: true }), false, true, false)).toBe(true)
  expect(packageVisible(makeState({ betweenPlays: true }), false, true, true)).toBe(false)
  expect(packageVisible(makeState({ betweenPlays: true, playSelect: true }), false, true, true)).toBe(true)
})

test('the scorebug shows each team helmet when one is known', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const state = makeState({ live: true })
  const helmets = new Map([[state.teams[0].id, 'blob:helmet-a']])
  render(<BroadcastView state={state} tracker={tracker} player={player} forcePackage={false} canvasSlot={() => undefined} games={null} helmets={helmets} />)
  const imgs = screen.getAllByTestId('bug-helmet')
  expect(imgs).toHaveLength(1)
  expect(imgs[0]).toHaveAttribute('src', 'blob:helmet-a')
})

test('the possession football follows the helmet and the team name', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const state = makeState({ live: true, possession: 0 })
  const helmets = new Map([[state.teams[0].id, 'blob:helmet-a']])
  render(<BroadcastView state={state} tracker={tracker} player={player} forcePackage={false} canvasSlot={() => undefined} games={null} helmets={helmets} />)
  const ball = screen.getByTestId('bug-ball')
  expect(ball.compareDocumentPosition(screen.getByTestId('bug-helmet')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  expect(ball.closest('.bug-abbr')?.textContent).toBe(state.teams[0].abbr)
})

test('the watermark shows only while the game is full size', () => {
  const { rerender } = render(<BroadcastView state={makeState()} tracker={new PlayTracker({ recordRoutes: false })} player={player} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  expect(screen.getByTestId('watermark')).toBeInTheDocument()
  expect(screen.getByTestId('watermark').querySelector('.wordmark-c3 .wm-stripes')).not.toBeNull()
  expect(screen.getByTestId('watermark').querySelector('.wordmark-c2')).toBeNull()
  rerender(<BroadcastView state={makeState({ playSelect: true })} tracker={new PlayTracker({ recordRoutes: false })} player={player} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  expect(screen.queryByTestId('watermark')).toBeNull()
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

test('the score panels start on the score, hold until the broadcast boxes, and the replay follows them', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  const tracker = new PlayTracker({ recordRoutes: false })
  const emulator = { clip: async () => clip } as unknown as Emulator
  const rom = new Uint8Array([1])
  const scored = (score: number, extra: Partial<GameState> = {}) => {
    const s = makeState(extra)
    s.teams[0].score = score
    return s
  }
  const view = (state: GameState, events: TrackerEvent[]) => (
    <BroadcastView state={state} tracker={tracker} player={player} forcePackage={false} canvasSlot={vi.fn()} games={null} events={events} emulator={emulator} rom={rom} />
  )
  const wait = (ms: number) =>
    act(async () => {
      vi.advanceTimersByTime(ms)
    })
  const { rerender } = render(view(scored(14), []))
  rerender(view(scored(20, { playOver: true }), []))
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  expect(screen.getByTestId('bug-score-0')).toHaveTextContent('14')
  await wait(1000)
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  expect(screen.getByTestId('bug-score-0')).toHaveTextContent('14')
  const ended: TrackerEvent[] = [{ type: 'playEnd', play: touchdown }]
  rerender(view(scored(20, { betweenPlays: true }), ended))
  const pkg = screen.getByTestId('stats-package')
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  expect(pkg).toHaveClass('replaying')
  expect(screen.queryByTestId('replay-stage')).toBeNull()
  await wait(WIPE_MIN_MS - 1000)
  expect(screen.getByTestId('scoring-wipe')).toHaveClass('wipe-leaving')
  expect(screen.getByTestId('bug-score-0')).toHaveTextContent('14')
  expect(screen.queryByTestId('replay-stage')).toBeNull()
  expect(pkg).toHaveClass('replaying')
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
  expect(pkg).not.toHaveClass('replaying')
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
  const view = (s: GameState, events: TrackerEvent[]) => (
    <BroadcastView state={s} tracker={tracker} player={player} forcePackage={false} canvasSlot={vi.fn()} games={null} events={events} emulator={emulator} rom={rom} />
  )
  const { rerender } = render(view(state(14), []))
  rerender(view(state(20), [{ type: 'playEnd', play: touchdown }]))
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  await act(async () => {
    vi.advanceTimersByTime(6000)
  })
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  expect(screen.getByTestId('bug-score-0')).toHaveTextContent('14')
  const boxed = state(20)
  boxed.betweenPlays = true
  boxed.playOver = false
  rerender(view(boxed, [{ type: 'playEnd', play: touchdown }]))
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
  const view = (boxed: boolean) => <BroadcastView state={state(boxed)} tracker={tracker} player={player} forcePackage={false} canvasSlot={vi.fn()} games={null} emulator={emulator} rom={rom} />
  const { rerender } = render(view(false))
  press(5)
  press(7)
  expect(frames).toHaveLength(0)
  rerender(view(true))
  expect(screen.getByTestId('stats-rushing')).toBeInTheDocument()
  press(5)
  expect(screen.getByTestId('stats-receiving')).toBeInTheDocument()
  press(4)
  expect(screen.getByTestId('stats-rushing')).toBeInTheDocument()
  expect(screen.queryByTestId('replay-stage')).toBeNull()
  press(7)
  expect(screen.getByTestId('stats-package')).toHaveClass('replaying')
  await act(async () => {
    await Promise.resolve()
  })
  expect(screen.getByTestId('replay-stage')).toHaveClass('replay-lead-in')
  expect(screen.getByTestId('stats-package')).toHaveClass('replaying')
  press(5)
  press(6)
  press(7)
  expect(screen.queryByTestId('replay-stage')).toBeNull()
  expect(screen.getByTestId('stats-rushing')).toBeInTheDocument()
  rerender(view(false))
  press(5)
  rerender(view(true))
  expect(screen.getByTestId('stats-rushing')).toBeInTheDocument()
  vi.unstubAllGlobals()
})

test('a lineup takes the league ticker band during play select and the league returns after', () => {
  vi.useFakeTimers()
  const tracker = new PlayTracker({ recordRoutes: false })
  const games = [game('KC', 7, 'DEN', 3, '2nd 4:00')]
  const view = (events: TrackerEvent[]) => (
    <BroadcastView state={makeState({ playSelect: true })} tracker={tracker} player={player} forcePackage={false} canvasSlot={vi.fn()} games={games} events={events} />
  )
  const { rerender } = render(view([]))
  const root = screen.getByTestId('broadcast-view')
  expect(root).toHaveClass('boxed')
  expect(screen.getByTestId('around-the-league')).toBeInTheDocument()
  const players = Array.from({ length: 11 }, (_, i) => ({ entry: i, role: 'QB', rosterIndex: i }))
  rerender(view([{ type: 'lineup', lineup: { team: 0, unit: 'offense', players } }]))
  expect(screen.getByTestId('lower-ticker-title')).toHaveTextContent('BUF OFFENSE')
  expect(screen.queryByTestId('around-the-league')).toBeNull()
  expect(root.className).toBe('view view-broadcast boxed')
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

test('the band and the league ticker fade without moving when reduced motion is asked for', () => {
  const css = readFileSync('src/views/broadcast/broadcast.css', 'utf8')
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  expect(reduced).toMatch(/\.lower-ticker,\s*\.league-enter \{\s*animation-name: band-fade-in;/)
  expect(reduced).toMatch(/\.lower-ticker-leaving \{\s*animation-name: band-fade-out;/)
  const fades = css.slice(css.indexOf('@keyframes band-fade-in'), css.indexOf('@media (prefers-reduced-motion: reduce)'))
  expect(fades).not.toContain('transform')
})

function rule(css: string, selector: string): string {
  const at = css.indexOf(`\n${selector} {`)
  return css.slice(at, css.indexOf('}', at))
}

test('the boxed game, the scorebug and the drive box share one pair of edge properties', () => {
  const css = readFileSync('src/views/broadcast/broadcast.css', 'utf8')
  expect(rule(css, '.bc-stage')).toMatch(/--box-left: \d+(\.\d+)?;/)
  expect(rule(css, '.bc-stage')).toMatch(/--box-right: \d+(\.\d+)?;/)
  expect(rule(css, '.bc-stage')).toMatch(/--box-scale: calc\(\(var\(--box-right\) - var\(--box-left\)\)/)
  expect(rule(css, '.boxed .bc-game')).toContain('var(--box-left)')
  expect(rule(css, '.scorebug')).toMatch(/left: calc\(var\(--box-left\) \* 1cqw\);/)
  expect(rule(css, '.pkg-drive')).toContain('var(--box-right)')
})

test('the halftime screen covers the stage and pauses the live game until a key closes it', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const emulator = { pause: vi.fn(), resume: vi.fn(), clip: vi.fn(async () => clip) } as unknown as Emulator
  const props = { tracker, player, forcePackage: false, canvasSlot: () => undefined, games: null, emulator, rom: new Uint8Array([1]) }
  const { rerender } = render(<BroadcastView state={makeState({ quarter: 1 })} {...props} />)
  expect(screen.queryByTestId('break-screen')).toBeNull()
  rerender(<BroadcastView state={makeState({ inGame: false, inBreak: true, quarter: 2, clock: { min: 0, sec: 0 } })} {...props} />)
  expect(screen.getByTestId('break-screen')).toHaveTextContent('HALFTIME')
  expect(emulator.pause).toHaveBeenCalledTimes(1)
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }))
  })
  expect(screen.queryByTestId('break-screen')).toBeNull()
  expect(emulator.resume).toHaveBeenCalledTimes(1)
})
