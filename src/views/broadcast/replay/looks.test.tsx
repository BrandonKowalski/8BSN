import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { ReplayPlayer } from '../../../emu/ReplayPlayer'
import type { Snapshot } from '../../../emu/snapshot'
import type { RosterPlayer } from '../../../game/roster'
import type { PlayResult } from '../../../game/playTracker'
import type { PlayerLookup } from '../../../game/useGame'
import { playerLabel, playHeadline } from '../../../game/format'
import { loadReplayFixture, replaySnapshots } from '../../../../tools/replayFixture'
import { decodeGameState } from '../../../game/decode'
import { TSB2026_MAP } from '../../../game/maps/tsb2026'
import { PlayTracker } from '../../../game/playTracker'
import FootageLook, { CAPTION_BUDGET, Caption, captionSize, captionText } from './FootageLook'
import ReplayStage from './ReplayStage'
import { separationOpacity, uprightAngle } from './Separation'
import TopDownLook from './TopDownLook'
import { SIDE_TOP } from '../RouteReplay'
import { teamColor } from '../teamColors'
import { CLIP_TAIL_FRAMES, type ReplayView } from './useReplay'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const LOS = 0x800
const QB = { x: LOS - 16, y: 0x70 }
const WR = { x: LOS + 120, y: 0x40 }

const spread = (i: number) => ({ x: LOS - 200 + i * 12, y: 0x20 + (i % 11) * 14 })

const sample = (overrides: Record<number, { x: number; y: number }>) => Array.from({ length: 22 }, (_, i) => overrides[i] ?? spread(i))

const rows = [
  sample({ 0: QB, 3: { x: LOS + 40, y: 0x40 }, 11: { x: LOS + 300, y: 0x40 }, 12: { x: LOS + 4, y: 0x70 } }),
  sample({ 0: { x: QB.x - 8, y: QB.y }, 3: { x: LOS + 80, y: 0x40 }, 11: { x: LOS + 300, y: 0x40 }, 12: { x: QB.x + 4, y: QB.y } }),
  sample({ 0: { x: QB.x - 8, y: QB.y }, 3: WR, 11: { x: WR.x + 32.8, y: WR.y }, 12: { x: QB.x + 4, y: QB.y } }),
]

const play = (overrides: Partial<PlayResult> = {}): PlayResult => ({
  index: 2,
  offense: 0,
  quarter: 1,
  yards: 22,
  touchdown: false,
  sack: false,
  interception: false,
  kicked: false,
  thrown: true,
  call: null,
  scramble: false,
  kind: 'scrimmage',
  isTry: false,
  routes: [],
  ball: [
    { ...rows[0][0], slot: 0 },
    { ...rows[1][0], slot: 0 },
    { ...rows[2][3], slot: 3 },
  ],
  field: { losX: LOS, toGainX: LOS + 80, attacksHigh: true },
  summary: 'ALLEN PASS TO KINCAID, 22 YDS',
  startFrame: 100,
  endFrame: 400,
  down: 1,
  toGo: 10,
  startBallOn: { yard: 25, side: 0 },
  scoreBefore: [0, 0],
  scoreAfter: [0, 0],
  tracks: { frames: [100, 160, 220], players: rows },
  people: { passer: 0, receiver: 6 },
  pass: null,
  airYards: null,
  yac: null,
  fumble: null,
  kickResult: null,
  returner: null,
  returnYards: null,
  ...overrides,
})

const roster: Record<number, RosterPlayer> = {
  0: { first: 'Josh', last: 'Allen', number: 17, position: 'QB' },
  6: { first: 'Dalton', last: 'Kincaid', number: 85, position: 'TE' },
  2: { first: 'Christian', last: 'McCaffrey', number: 23, position: 'RB' },
  8: { first: 'Juju', last: 'Smith-Schuster', number: 9, position: 'WR' },
}
const ward: RosterPlayer = { first: 'Denzel', last: 'Ward', number: 24, position: 'DB' }
const lookup: PlayerLookup = (team, index) => (team === 0 ? roster[index] ?? null : index === 26 ? ward : null)

const fakePlayer = (screenMode: number, shownAt = 220): ReplayPlayer => {
  const ram = new Uint8Array(0x800)
  ram[0x0f] = screenMode
  const camera = LOS - 128
  ram[0x54] = camera & 0xff
  ram[0x55] = camera >> 8
  const at = 0x39f + 0x20 * 3
  ram[at + 0x14] = WR.x & 0xff
  ram[at + 0x15] = WR.x >> 8
  ram[at + 0x17] = WR.y
  const rival = 0x39f + 0x20 * 11
  ram[rival + 0x14] = (WR.x + 33) & 0xff
  ram[rival + 0x15] = (WR.x + 33) >> 8
  ram[rival + 0x17] = WR.y
  return {
    from: 90,
    finish: vi.fn(),
    readSnapshot(into: Snapshot) {
      into.ram.set(ram)
      into.frame = shownAt - 90
      return true
    },
  } as unknown as ReplayPlayer
}

const view = (overrides: Partial<ReplayView> = {}): ReplayView => ({
  play: play(),
  label: 'INSTANT REPLAY',
  look: 'footage',
  leadIn: false,
  player: null,
  canvas: document.createElement('canvas'),
  skip: () => undefined,
  ...overrides,
})

test('footage draws the open ring with no words on the picture', () => {
  const { container } = render(<FootageLook view={view({ player: fakePlayer(0x16, 219) })} abbrs={['BUF', 'MIA']} player={lookup} />)
  const ring = screen.getByTestId('open-ring')
  expect(ring.getAttribute('cx')).toBe(String(WR.x - (LOS - 128)))
  expect(container.querySelector('.replay-picture text')).toBeNull()
  expect(screen.queryByText(/OPEN/)).toBeNull()
  expect(container.querySelector('.footage-los')).not.toBeNull()
  expect(container.querySelector('.footage-gain')).not.toBeNull()
  expect(screen.getByTestId('footage-ball')).toBeInTheDocument()
  expect(container.querySelector('canvas')).not.toBeNull()
})

test('the open ring is centered on the receiver body and encloses the whole sprite', () => {
  render(<FootageLook view={view({ player: fakePlayer(0x16) })} abbrs={['BUF', 'MIA']} player={lookup} />)
  const ring = screen.getByTestId('open-ring')
  const top = WR.y + 1 - 8
  const cx = Number(ring.getAttribute('cx'))
  const cy = Number(ring.getAttribute('cy'))
  const r = Number(ring.getAttribute('r'))
  expect(cx).toBe(WR.x - (LOS - 128))
  expect(cy).toBe(top + 8)
  expect(r - 8).toBeGreaterThanOrEqual(1)
  expect(r - 8).toBeLessThanOrEqual(2)
  for (const [dx, dy] of [[-6, 0], [6, 0], [-6, 16], [6, 16]]) expect(Math.hypot(cx + dx - cx, top + dy - cy)).toBeLessThanOrEqual(r)
  expect(Number(ring.getAttribute('stroke-width'))).toBeLessThanOrEqual(1)
})

test('at the catch footage rings the nearest defender and joins the rings with an unlabeled line', () => {
  const footage = (at: number) => <FootageLook view={view({ player: fakePlayer(0x16, at) })} abbrs={['BUF', 'MIA']} player={lookup} />
  const { rerender, container } = render(footage(219))
  expect(screen.queryByTestId('footage-separation')).toBeNull()
  rerender(footage(220))
  const receiver = screen.getByTestId('open-ring')
  const defender = screen.getByTestId('footage-separation-defender')
  expect(receiver.getAttribute('r')).toBe(defender.getAttribute('r'))
  expect(defender.getAttribute('stroke')).toBe('#ff5a36')
  expect(defender.getAttribute('cx')).toBe(String(WR.x + 33 - (LOS - 128)))
  expect(defender.getAttribute('cy')).toBe(receiver.getAttribute('cy'))
  const line = screen.getByTestId('footage-separation-line')
  expect([line.getAttribute('x1'), line.getAttribute('y1'), line.getAttribute('x2'), line.getAttribute('y2')]).toEqual([
    receiver.getAttribute('cx'),
    receiver.getAttribute('cy'),
    defender.getAttribute('cx'),
    defender.getAttribute('cy'),
  ])
  expect(screen.queryByTestId('footage-separation-label')).toBeNull()
  expect(container.querySelector('.replay-picture text')).toBeNull()
})

test('the separation number follows the line angle and stays upright', () => {
  expect(uprightAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0)
  expect(uprightAngle({ x: 10, y: 0 }, { x: 0, y: 0 })).toBe(0)
  expect(uprightAngle({ x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(45)
  expect(uprightAngle({ x: 10, y: 10 }, { x: 0, y: 0 })).toBeCloseTo(45)
  expect(uprightAngle({ x: 10, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(-45)
  expect(uprightAngle({ x: 0, y: 10 }, { x: 0, y: 0 })).toBe(90)
  expect(uprightAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90)
})

test('top-down rings the receiver and the nearest defender at the catch and labels the separation', async () => {
  const p = play({ pass: { from: rows[1][0], to: { x: WR.x, y: WR.y }, outcome: 'caught', frames: [160, 220] } })
  const first = render(<TopDownLook play={p} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(screen.queryByTestId('topdown-separation')).toBeNull()
  first.unmount()
  vi.stubGlobal('requestAnimationFrame', (tick: FrameRequestCallback) => setTimeout(() => tick(performance.now() + 60000), 0))
  render(<TopDownLook play={p} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(await screen.findByTestId('topdown-separation')).toBeInTheDocument()
  const receiver = screen.getByTestId('topdown-carrier')
  const defender = screen.getByTestId('topdown-separation-defender')
  expect([receiver.getAttribute('cx'), receiver.getAttribute('cy')]).toEqual([String(WR.x), String(WR.y)])
  expect([defender.getAttribute('cx'), defender.getAttribute('cy')]).toEqual([String(WR.x + 32.8), String(WR.y)])
  expect(receiver.getAttribute('r')).toBe(defender.getAttribute('r'))
  expect(screen.getByTestId('topdown-separation-text').textContent).toBe('4.1 YDS')
})

test('footage marks sit at the player feet, not the sprite top', () => {
  const { container } = render(<FootageLook view={view({ player: fakePlayer(0x16) })} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(screen.getByTestId('footage-ball').getAttribute('d')).toMatch(new RegExp(`^M${QB.x - (LOS - 128)},${QB.y + 1 - 8 + 16}L`))
  expect(container.querySelector('.footage-los')?.getAttribute('y1')).toBe(String(SIDE_TOP + 1 - 8 + 16))
})

const commands = (testId: string) => (screen.queryByTestId(testId)?.getAttribute('d') ?? '').match(/[ML]/g)?.length ?? 0

test('the footage line grows behind the runner as the clip plays', () => {
  const footage = (p: PlayResult, at: number) => <FootageLook view={view({ play: p, player: fakePlayer(0x16, at) })} abbrs={['BUF', 'MIA']} player={lookup} />
  const { rerender } = render(footage(play(), 100))
  expect(screen.queryByTestId('footage-ball')).toBeNull()
  rerender(footage(play(), 159))
  expect(screen.queryByTestId('footage-ball')).toBeNull()
  rerender(footage(play(), 160))
  expect(commands('footage-ball')).toBe(2)
  rerender(footage(play(), 220))
  expect(commands('footage-ball')).toBe(3)
  cleanup()
  const { rerender: again } = render(footage(completed(), 199))
  expect(commands('footage-ball')).toBe(2)
  expect(screen.queryByTestId('footage-flight')).toBeNull()
  expect(screen.queryByTestId('footage-air')).toBeNull()
  expect(screen.queryByTestId('footage-yac')).toBeNull()
  again(footage(completed(), 200))
  expect(screen.getByTestId('footage-flight')).toBeInTheDocument()
  expect(screen.getByTestId('footage-air')).toBeInTheDocument()
  expect(screen.queryByTestId('footage-yac')).toBeNull()
  again(footage(completed(), 220))
  expect(commands('footage-yac')).toBe(2)
  cleanup()
  const { rerender: fumbled } = render(footage(lostFumble(), 179))
  expect(screen.queryByTestId('fumble-burst')).toBeNull()
  expect(screen.queryByTestId('footage-recovery')).toBeNull()
  fumbled(footage(lostFumble(), 220))
  expect(screen.getByTestId('fumble-burst')).toBeInTheDocument()
  expect(screen.getByTestId('footage-recovery')).toBeInTheDocument()
})

test('footage with no camera draws nothing and keeps the stats in the strip', () => {
  const { container, rerender } = render(<FootageLook view={view()} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(screen.queryByTestId('open-ring')).toBeNull()
  expect(screen.queryByTestId('footage-ball')).toBeNull()
  expect(container.querySelector('.footage-los')).toBeNull()
  expect(screen.getByTestId('replay-stats')).toHaveTextContent(/^CLOSEST RUSH \d+\.\d YDS AT \d+\.\d S$/)
  rerender(<FootageLook view={view({ player: fakePlayer(0x17) })} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(screen.queryByTestId('open-ring')).toBeNull()
  expect(container.querySelector('.footage-los')).toBeNull()
  expect(screen.getByTestId('replay-stats')).toHaveTextContent('SEPARATION 4.1 YDS')
})

test('top-down draws 22 tokens and numbers the people in the play', () => {
  render(<TopDownLook play={play()} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(screen.getAllByTestId('token')).toHaveLength(22)
  expect(screen.getAllByTestId('token-number').map((n) => n.textContent).sort()).toEqual(['#17', '#85'])
})

test('the replay caption is the LAST PLAY sentence with names shortened to fit', () => {
  expect(captionText(play(), lookup)).toBe(playHeadline(play(), lookup, 'initial'))
  expect(captionText(play(), lookup)).toBe('J. ALLEN 22 YARD PASS TO D. KINCAID')
  expect(captionText(play({ people: { passer: 2, receiver: 8 } }), lookup)).toBe('MCCAFFREY 22 YARD PASS TO SMITH-SCHUSTER')
  expect(captionText(play({ people: { passer: 2, receiver: 8 } }), lookup).length).toBeLessThanOrEqual(40)
  expect(captionText(play({ people: { rusher: 2 }, thrown: false }), lookup)).toBe('CHRISTIAN MCCAFFREY 22 YARD RUSH')
  expect(captionText(play({ people: {}, summary: 'SACK, -7 YDS' }), lookup)).toBe('SACK, -7 YDS')
})

test('the replay caption names who recovered a lost fumble instead of saying FUMBLE LOST', () => {
  render(<Caption play={lostFumble()} player={lookup} />)
  const caption = screen.getByTestId('replay-caption')
  expect(caption.textContent).toBe(playHeadline(lostFumble(), lookup, 'initial'))
  expect(caption).toHaveTextContent(/^D. KINCAID FUMBLE, RECOVERED BY D. WARD$/)
})

const knockedDown = () =>
  play({
    yards: 0,
    people: { passer: 0 },
    summary: 'ALLEN PASS INCOMPLETE',
    ball: [{ ...rows[0][0], slot: 0 }, { ...rows[1][0], slot: 0 }],
    pass: { from: rows[1][0], to: { x: LOS + 100, y: 0x48 }, outcome: 'deflected', by: { team: 1, rosterIndex: 26 }, frames: [160, 200] },
  })

test('footage draws the throw to the knocked down spot and names the defender', () => {
  render(<FootageLook view={view({ play: knockedDown(), player: fakePlayer(0x16) })} abbrs={['BUF', 'MIA']} player={lookup} />)
  const flight = screen.getByTestId('footage-flight')
  expect(flight.getAttribute('d')).toMatch(new RegExp(`${LOS + 100 - (LOS - 128)},${0x48 + 1 - 8 + 16}$`))
  expect(screen.getByTestId('pass-x')).toBeInTheDocument()
  expect(screen.getByTestId('pass-end').textContent).toBe(`KNOCKED DOWN BY ${playerLabel(ward, 'initial')}`)
  expect(screen.getByText('KNOCKED DOWN BY #24 D. WARD DB')).toBeInTheDocument()
})

test('top-down flies the ball and marks where the pass ended once the play reaches it', async () => {
  const p = knockedDown()
  render(<TopDownLook play={p} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(screen.queryByTestId('pass-x')).toBeNull()
  cleanup()
  vi.stubGlobal('requestAnimationFrame', (tick: FrameRequestCallback) => setTimeout(() => tick(performance.now() + 60000), 0))
  render(<TopDownLook play={p} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(await screen.findByTestId('pass-x')).toBeInTheDocument()
  expect(screen.getByTestId('topdown-flight')).toBeInTheDocument()
  expect(screen.getByText('KNOCKED DOWN BY #24 D. WARD DB')).toBeInTheDocument()
})

const completed = () =>
  play({
    pass: { from: rows[1][0], to: { x: WR.x, y: WR.y }, outcome: 'caught', frames: [160, 200] },
    airYards: 15,
    yac: 7,
  })

test('footage colors the throw past the line and the run after the catch and keys them', () => {
  render(<FootageLook view={view({ play: completed(), player: fakePlayer(0x16) })} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(screen.getByTestId('footage-flight')).toHaveClass('footage-ball')
  const air = screen.getByTestId('footage-air')
  expect(air).toHaveClass('footage-air')
  expect(air.getAttribute('d')).toMatch(new RegExp(`^M${LOS - (LOS - 128)},`))
  expect(screen.getByTestId('footage-yac')).toHaveClass('footage-yac')
  expect(screen.getByTestId('replay-stats')).toHaveTextContent('AIR 15 YDS')
  expect(screen.getByTestId('replay-stats')).toHaveTextContent('YAC 7 YDS')
  expect(screen.queryByTestId('air-key')).toBeNull()
})

test('top-down colors the throw past the line and the run after the catch', async () => {
  vi.stubGlobal('requestAnimationFrame', (tick: FrameRequestCallback) => setTimeout(() => tick(performance.now() + 60000), 0))
  render(<TopDownLook play={completed()} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(await screen.findByTestId('topdown-yac')).toHaveClass('topdown-yac')
  expect(screen.getByTestId('topdown-air')).toHaveClass('topdown-air')
  expect(screen.getByTestId('topdown-flight')).toHaveClass('topdown-flight')
})

test('footage keeps a defensive return after a fumbled catch out of the YAC color', () => {
  const p = completed()
  const fumbled = play({
    ...p,
    airYards: null,
    yac: null,
    ball: [...p.ball, { x: WR.x + 8, y: WR.y, slot: 3 }, { x: WR.x + 4, y: WR.y + 8, slot: 15 }, { x: WR.x - 8, y: WR.y + 14, slot: 15 }],
  })
  render(<FootageLook view={view({ play: fumbled, player: fakePlayer(0x16) })} abbrs={['BUF', 'MIA']} player={lookup} />)
  const yac = screen.getByTestId('footage-yac').getAttribute('d') ?? ''
  expect(yac.match(/[ML]/g)).toHaveLength(3)
  const back = screen.getByTestId('footage-return')
  expect(back).toHaveClass('footage-ball')
  expect(back).not.toHaveClass('footage-yac')
  expect(back.getAttribute('d')).toMatch(new RegExp(`L${WR.x - 8 - (LOS - 128)},`))
})

const lostFumble = () => {
  const p = completed()
  const spot = { x: WR.x + 8, y: WR.y }
  return play({
    ...p,
    airYards: null,
    yac: null,
    people: {},
    summary: 'FUMBLE LOST',
    ball: [...p.ball, { ...spot, slot: 3 }, { x: WR.x + 10, y: WR.y + 2, slot: 3 }, { x: WR.x + 4, y: WR.y + 8, slot: 15 }, { x: WR.x - 8, y: WR.y + 14, slot: 15 }],
    fumble: { at: spot, frame: 180, index: 3, by: { team: 0, rosterIndex: 6 }, recoveredBy: { team: 1, rosterIndex: 26 }, recovery: { slot: 15, frame: 200, index: 5 }, lost: true },
  })
}

test('a lost fumble draws the recovery in the defense color in every look', async () => {
  render(<FootageLook view={view({ play: lostFumble(), player: fakePlayer(0x16) })} abbrs={['BUF', 'MIA']} player={lookup} />)
  const footage = screen.getByTestId('footage-recovery')
  expect(footage.getAttribute('stroke')).toBe(teamColor('MIA').primary)
  expect(footage.getAttribute('d')).toMatch(new RegExp(`^M${WR.x + 8 - (LOS - 128)},`))
  expect(screen.queryByTestId('footage-return')).toBeNull()
  expect(screen.getByTestId('fumble-burst')).toBeInTheDocument()
  expect(screen.getByTestId('fumble-label')).toHaveTextContent(/^RECOVERED BY #24 DENZEL WARD DB$/)
  cleanup()
  render(<TopDownLook play={lostFumble()} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(screen.queryByTestId('fumble-burst')).toBeNull()
  cleanup()
  vi.stubGlobal('requestAnimationFrame', (tick: FrameRequestCallback) => setTimeout(() => tick(performance.now() + 60000), 0))
  render(<TopDownLook play={lostFumble()} abbrs={['BUF', 'MIA']} player={lookup} />)
  const topdown = await screen.findByTestId('topdown-recovery')
  expect(topdown.getAttribute('stroke')).toBe(teamColor('MIA').primary)
  expect(topdown.getAttribute('d')).toMatch(new RegExp(`^M${WR.x + 8},${WR.y}L`))
  expect(screen.getByTestId('fumble-burst')).toBeInTheDocument()
  expect(screen.getByTestId('fumble-label')).toHaveTextContent(/^RECOVERED BY #24 DENZEL WARD DB$/)
})

type Box = { x0: number; y0: number; x1: number; y1: number }
const num = (el: Element, name: string) => Number(el.getAttribute(name))
const textBox = (el: Element): Box => {
  const size = num(el, 'font-size')
  const half = ((el.textContent ?? '').length * size * 0.62) / 2
  return { x0: num(el, 'x') - half, y0: num(el, 'y') - size * 0.8, x1: num(el, 'x') + half, y1: num(el, 'y') + size * 0.2 }
}
const plateBox = (el: Element): Box => ({ x0: num(el, 'x'), y0: num(el, 'y'), x1: num(el, 'x') + num(el, 'width'), y1: num(el, 'y') + num(el, 'height') })
const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

test('the top-down recovery label sits on a plate clear of the tokens and their numbers and inside the view', async () => {
  vi.stubGlobal('requestAnimationFrame', (tick: FrameRequestCallback) => setTimeout(() => tick(performance.now() + 60000), 0))
  const { container } = render(<TopDownLook play={lostFumble()} abbrs={['BUF', 'MIA']} player={lookup} />)
  const plate = plateBox(await screen.findByTestId('fumble-label-plate'))
  const label = textBox(screen.getByTestId('fumble-label'))
  expect(label.x0).toBeGreaterThanOrEqual(plate.x0)
  expect(label.x1).toBeLessThanOrEqual(plate.x1)
  const tags = screen.getAllByTestId('token-number').map(textBox)
  expect(tags.length).toBeGreaterThan(0)
  for (const tag of tags) expect(hits(plate, tag)).toBe(false)
  for (const token of screen.getAllByTestId('token')) {
    const r = num(token, 'r')
    expect(hits(plate, { x0: num(token, 'cx') - r, y0: num(token, 'cy') - r, x1: num(token, 'cx') + r, y1: num(token, 'cy') + r })).toBe(false)
  }
  const [x, y, w, h] = (container.querySelector('svg')?.getAttribute('viewBox') ?? '').split(' ').map(Number)
  expect(plate.x0).toBeGreaterThanOrEqual(x)
  expect(plate.y0).toBeGreaterThanOrEqual(y)
  expect(plate.x1).toBeLessThanOrEqual(x + w)
  expect(plate.y1).toBeLessThanOrEqual(y + h)
})

let frames: FrameRequestCallback[] = []
const manualFrames = () => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (tick: FrameRequestCallback) => frames.push(tick))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
}
const runFrame = (ms: number) =>
  act(() => {
    const due = frames
    frames = []
    const now = performance.now() + ms
    for (const tick of due) tick(now)
  })
const tightEnd = () => screen.getAllByTestId('token')[3].getAttribute('cx')

test('the looping top-down keeps its place when the closing play is rebuilt', () => {
  manualFrames()
  const { rerender } = render(<TopDownLook play={play()} abbrs={['BUF', 'MIA']} player={lookup} loop />)
  runFrame(1000)
  expect(tightEnd()).toBe(String(rows[1][3].x))
  rerender(<TopDownLook play={play()} abbrs={['BUF', 'MIA']} player={lookup} loop />)
  expect(tightEnd()).toBe(String(rows[1][3].x))
  runFrame(1000)
  expect(tightEnd()).toBe(String(rows[1][3].x))
  rerender(<TopDownLook play={play({ endFrame: 420 })} abbrs={['BUF', 'MIA']} player={lookup} loop />)
  expect(tightEnd()).toBe(String(rows[0][3].x))
})

test('the held top-down frame keeps only the last second of trails', () => {
  manualFrames()
  render(<TopDownLook play={play()} abbrs={['BUF', 'MIA']} player={lookup} />)
  runFrame(60000)
  const trails = [...document.querySelectorAll('.topdown-trail')]
  expect(trails).toHaveLength(22)
  for (const t of trails) expect(t.getAttribute('d')?.match(/[ML]/g)).toHaveLength(2)
  expect(trails[3].getAttribute('d')).toBe(`M${rows[1][3].x},${rows[1][3].y}L${rows[2][3].x},${rows[2][3].y}`)
})

const scripted = () => {
  const state = { at: 220, wr: WR.x }
  const player = {
    from: 90,
    readSnapshot(into: Snapshot) {
      into.ram.fill(0)
      into.ram[0x0f] = 0x16
      const camera = state.at > 300 ? LOS - 100 : LOS - 128
      into.ram[0x54] = camera & 0xff
      into.ram[0x55] = camera >> 8
      const put = (slot: number, x: number, y: number) => {
        const at = 0x39f + 0x20 * slot
        into.ram[at + 0x14] = x & 0xff
        into.ram[at + 0x15] = x >> 8
        into.ram[at + 0x17] = y
      }
      put(3, state.wr, WR.y)
      put(11, state.wr + 33, WR.y)
      into.frame = state.at - 90
      return true
    },
  } as unknown as ReplayPlayer
  return { state, player }
}

const driven = () => {
  const queue: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  return () => act(() => queue.splice(0).forEach((cb) => cb(0)))
}

test('separation holds for 1500 ms of replay time then fades out over 300 ms', () => {
  expect(separationOpacity(0)).toBe(1)
  expect(separationOpacity(1500)).toBe(1)
  expect(separationOpacity(1650)).toBeCloseTo(0.5)
  expect(separationOpacity(1800)).toBe(0)
  expect(separationOpacity(5000)).toBe(0)
})

test('footage freezes the rings and line at the catch, holds them, then fades them out without following the players', () => {
  const step = driven()
  const { state, player } = scripted()
  const { rerender } = render(<FootageLook view={view({ player })} abbrs={['BUF', 'MIA']} player={lookup} />)
  step()
  const receiver = screen.getByTestId('open-ring')
  const cx = receiver.getAttribute('cx')
  const defender = screen.getByTestId('footage-separation-defender')
  const dx = defender.getAttribute('cx')
  state.wr = WR.x + 40
  state.at = 220 + 60
  step()
  expect(screen.getByTestId('open-ring').getAttribute('cx')).toBe(cx)
  expect(screen.getByTestId('footage-separation-defender').getAttribute('cx')).toBe(dx)
  state.at = 220 + 105
  step()
  const faded = Number(screen.getByTestId('footage-separation').getAttribute('opacity'))
  expect(faded).toBeGreaterThan(0)
  expect(faded).toBeLessThan(1)
  expect(screen.getByTestId('open-ring').getAttribute('cx')).toBe(cx)
  state.at = 220 + 120
  step()
  expect(screen.queryByTestId('open-ring')).toBeNull()
  expect(screen.queryByTestId('footage-separation')).toBeNull()
  rerender(<FootageLook view={view({ player })} abbrs={['BUF', 'MIA']} player={lookup} />)
  step()
  expect(screen.queryByTestId('open-ring')).toBeNull()
})

const carriedBy = (slot: number) =>
  play({
    pass: { from: rows[1][0], to: { x: WR.x, y: WR.y }, outcome: 'caught', frames: [160, 220] },
    ball: [
      { ...rows[0][0], slot: 0 },
      { ...rows[1][0], slot: 0 },
      { ...rows[2][slot], slot },
    ],
  })

const runToEnd = () => vi.stubGlobal('requestAnimationFrame', (tick: FrameRequestCallback) => setTimeout(() => tick(performance.now() + 60000), 0))

test('top-down draws one ring on a receiver who is carrying the ball', async () => {
  runToEnd()
  render(<TopDownLook play={carriedBy(3)} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(await screen.findByTestId('topdown-separation')).toBeInTheDocument()
  expect(screen.getByTestId('topdown-carrier')).toBeInTheDocument()
  expect(screen.queryByTestId('topdown-open')).toBeNull()
  expect(screen.getByTestId('topdown-separation-defender')).toBeInTheDocument()
})

test('the replay caption shrinks so the longest sentence fits one line of the window', () => {
  const long = play({ people: { passer: 2, receiver: 8 } })
  const text = captionText(long, lookup)
  expect(text).toBe('MCCAFFREY 22 YARD PASS TO SMITH-SCHUSTER')
  expect(captionSize(text) * text.length).toBeLessThanOrEqual(CAPTION_BUDGET)
  expect(captionSize('SACK, -7 YDS')).toBe(3.8)
  render(<Caption play={long} player={lookup} />)
  expect(screen.getByTestId('replay-caption').style.fontSize).toBe(`${captionSize(text)}cqh`)
  const valdes = play({ people: { passer: 2, receiver: 8 } })
  const bigRoster: PlayerLookup = (team, index) => (team === 0 && index === 2 ? { first: 'Marquez', last: 'Valdes-Scantling', number: 11, position: 'QB' } : roster[index] ?? null)
  const t = captionText(valdes, bigRoster)
  expect(captionSize(t) * t.length).toBeLessThanOrEqual(CAPTION_BUDGET)
})

test('replay stats sit between the title and the picture', () => {
  const at = (frame: number) => <ReplayStage view={view({ play: completed(), player: fakePlayer(0x16, frame) })} abbrs={['BUF', 'MIA']} player={lookup} />
  const { rerender } = render(at(150))
  const stage = screen.getByTestId('replay-stage')
  expect([...stage.children].map((el) => el.className)).toEqual(['replay-head', 'replay-stats', 'replay-picture', 'replay-caption'])
  const strip = screen.getByTestId('replay-stats')
  const rush = /^CLOSEST RUSH \d+\.\d YDS AT \d+\.\d S$/
  expect([...strip.children].map((el) => el.textContent)).toEqual([expect.stringMatching(rush)])
  rerender(at(200))
  expect([...strip.children].map((el) => el.textContent)).toEqual(['AIR 15 YDS', 'YAC 7 YDS', expect.stringMatching(rush)])
  rerender(at(220))
  expect([...strip.children].map((el) => el.textContent)).toEqual(['AIR 15 YDS', 'YAC 7 YDS', 'SEPARATION 4.1 YDS', expect.stringMatching(rush)])
  expect([...strip.querySelectorAll('.replay-stat-unit')].map((el) => el.textContent)).toEqual(['YDS', 'YDS', 'YDS', 'YDS', 'S'])
  const picture = stage.querySelector('.replay-picture')!
  expect(picture.querySelector('text, .air-key, .footage-tags')).toBeNull()
  expect(picture.textContent).toBe('')
  expect(screen.getByTestId('open-ring')).toBeInTheDocument()
  expect(screen.getByTestId('footage-separation-line')).toBeInTheDocument()
  expect(screen.getByTestId('footage-separation-defender')).toBeInTheDocument()
})

const gameA = loadReplayFixture('tests/fixtures/tsb2026/replay-game-a.json.gz')

function recorded(window: string, index: number) {
  const tracker = new PlayTracker({ recordRoutes: true })
  const rams = new Map<number, Uint8Array>()
  for (const snap of replaySnapshots(gameA, window)) {
    tracker.push(decodeGameState(snap, TSB2026_MAP, []))
    rams.set(snap.frame, snap.ram.slice())
  }
  const p = tracker.plays()[index]
  const last = Math.max(...rams.keys())
  const state = { at: p.startFrame }
  const finish = vi.fn()
  const player = {
    from: p.startFrame,
    finish,
    readSnapshot(into: Snapshot) {
      into.ram.set(rams.get(state.at)!)
      into.frame = state.at - p.startFrame
      return true
    },
  } as unknown as ReplayPlayer
  const step = driven()
  render(<FootageLook view={view({ play: p, player })} abbrs={['BUF', 'CLE']} player={lookup} />)
  const field = (frame: number) => rams.get(frame)![TSB2026_MAP.screenMode.offset] === TSB2026_MAP.fieldMode
  let stopped: number | null = null
  for (; state.at <= last && stopped === null; state.at++) {
    step()
    if (finish.mock.calls.length > 0) stopped = state.at
  }
  return { play: p, stopped, field, finish }
}

test('a touchdown replay stops before the celebration', () => {
  const { play: p, stopped, field, finish } = recorded('touchdown', 0)
  expect(p.touchdown).toBe(true)
  expect(stopped).toBe(11566)
  expect(finish).toHaveBeenCalledTimes(1)
  expect(field(stopped!)).toBe(false)
  for (let f = p.endFrame + 1; f < stopped!; f++) expect(field(f)).toBe(true)
  for (let f = p.startFrame; f <= p.endFrame + CLIP_TAIL_FRAMES; f++) expect(field(f)).toBe(true)
})

test('a pass cutscene during the play still plays', () => {
  const { play: p, stopped, field } = recorded('kickoff', 1)
  const cutscene = Array.from({ length: p.endFrame - p.startFrame }, (_, i) => p.startFrame + i).filter((f) => !field(f))
  expect(cutscene.length).toBeGreaterThan(60)
  expect(stopped).toBeGreaterThan(p.endFrame + CLIP_TAIL_FRAMES)
  expect(field(stopped!)).toBe(false)
})
