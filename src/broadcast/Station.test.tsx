import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, expect, test, vi } from 'vitest'
import type { Emulator } from '../emu/Emulator'
import { EMPTY_PACKAGE } from '../packages/empty'
import { renderStation } from '../sdk/testing'
import type { ActionPulse, BroadcastPackage, Layout, Phase, SlotProps } from '../sdk/types'
import { TAIL_MS } from '../tailgate/useTailgate'
import { DEFAULT_LAYOUT } from './layout'
import LeagueTicker from './LeagueTicker'
import { ENTER_MS } from './Station'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

type Fake = { phase: Phase; ticker?: boolean; entry?: 'a' | 'b' | null; hold?: boolean }

let now: Fake = { phase: 'menus' }
let pulses: ActionPulse[] = []

const set = (next: Fake) => {
  now = next
}

const Mark = (id: string) =>
  function Marked({ phase }: SlotProps<Fake>) {
    return <div data-testid={id}>{phase}</div>
  }

const fake = (over: Partial<BroadcastPackage<Fake, null>> = {}): BroadcastPackage<Fake, null> => ({
  id: 'fake',
  name: 'Fake',
  contract: 1,
  roms: [{ sha1: 'f00d', title: 'Fake', about: '' }],
  useSession: (ctx) => {
    pulses.push(ctx.action)
    return { data: now, phase: now.phase, generation: 0, save: () => null, restore() {}, suspend() {}, resume() {} }
  },
  slots: {},
  ...over,
})

const full = () =>
  fake({
    slots: {
      Scorebug: Mark('fake-scorebug'),
      moments: { Base: Mark('fake-top'), defs: [] },
      Stats: Mark('fake-stats'),
      left: { entries: [], Fallback: Mark('fake-left') },
    },
  })

test('EMPTY_PACKAGE renders the 8BSN fallback ticker and no slots', () => {
  renderStation(EMPTY_PACKAGE)
  expect(screen.getByTestId('bc-stage')).toHaveAttribute('data-phase', 'menus')
  expect(screen.getByTestId('region-ticker')).toBeVisible()
  expect(screen.getByTestId('around-the-league')).toHaveTextContent('8-BIT SPORTS NETWORK')
  expect(screen.queryByTestId('league-game')).toBeNull()
  for (const region of ['top', 'replay', 'stats', 'left', 'scorebug']) expect(screen.getByTestId(`region-${region}`)).toBeEmptyDOMElement()
  expect(screen.getByTestId('watermark')).toBeVisible()
})

test('regions show only in their phases', () => {
  set({ phase: 'live' })
  const { rerender } = renderStation(full())
  expect(screen.getByTestId('fake-scorebug')).toHaveTextContent('live')
  expect(screen.queryByTestId('fake-top')).toBeNull()
  expect(screen.queryByTestId('fake-stats')).toBeNull()
  expect(screen.queryByTestId('fake-left')).toBeNull()
  expect(screen.getByTestId('region-ticker')).not.toBeVisible()
  expect(screen.getByTestId('watermark')).toBeVisible()
  set({ phase: 'window' })
  rerender()
  expect(screen.getByTestId('bc-stage')).toHaveAttribute('data-phase', 'window')
  expect(screen.getByTestId('fake-top')).toBeVisible()
  expect(screen.getByTestId('fake-stats')).toBeVisible()
  expect(screen.getByTestId('fake-left')).toBeVisible()
  expect(screen.getByTestId('fake-scorebug')).toHaveTextContent('window')
  expect(screen.getByTestId('region-ticker')).toBeVisible()
  expect(screen.getByTestId('watermark')).not.toBeVisible()
  set({ phase: 'pregame' })
  rerender()
  expect(screen.queryByTestId('fake-stats')).toBeNull()
  expect(screen.getByTestId('region-ticker')).not.toBeVisible()
})

test('a package ticker replaces league scores while active and the league enters after', () => {
  vi.useFakeTimers()
  set({ phase: 'window', ticker: false })
  const pkg = fake({ slots: { tickers: [{ id: 'crawl', when: (d) => d.ticker === true, Render: Mark('fake-ticker') }] } })
  const { rerender } = renderStation(pkg)
  expect(screen.getByTestId('around-the-league')).not.toHaveClass('league-enter')
  set({ phase: 'window', ticker: true })
  rerender()
  expect(screen.getByTestId('fake-ticker')).toBeInTheDocument()
  expect(screen.queryByTestId('around-the-league')).toBeNull()
  set({ phase: 'window', ticker: false })
  rerender()
  expect(screen.queryByTestId('fake-ticker')).toBeNull()
  expect(screen.getByTestId('around-the-league')).toHaveClass('league league-enter')
  act(() => vi.advanceTimersByTime(ENTER_MS - 1))
  expect(screen.getByTestId('around-the-league')).toHaveClass('league-enter')
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByTestId('around-the-league')).not.toHaveClass('league-enter')
})

test('left panel picks the first matching entry and falls back', () => {
  set({ phase: 'window', entry: 'a' })
  const pkg = fake({
    slots: {
      left: {
        entries: [
          { id: 'a', when: (d) => d.entry === 'a', Render: Mark('entry-a') },
          { id: 'b', when: (d) => d.entry !== null, Render: Mark('entry-b') },
        ],
        Fallback: Mark('entry-fallback'),
      },
    },
  })
  const { rerender } = renderStation(pkg)
  expect(screen.getByTestId('entry-a')).toBeInTheDocument()
  expect(screen.queryByTestId('entry-b')).toBeNull()
  set({ phase: 'window', entry: 'b' })
  rerender()
  expect(screen.getByTestId('entry-b')).toBeInTheDocument()
  expect(screen.queryByTestId('entry-a')).toBeNull()
  set({ phase: 'window', entry: null })
  rerender()
  expect(screen.getByTestId('entry-fallback')).toBeInTheDocument()
  expect(screen.getByTestId('region-left')).toContainElement(screen.getByTestId('entry-fallback'))
})

test('a custom layout moves the ticker', () => {
  const layout: Layout = {
    game: { ...DEFAULT_LAYOUT.game, window: { x: 10, y: 0, w: 40 } },
    regions: { ...DEFAULT_LAYOUT.regions, ticker: { rect: { x: 0, y: 0, w: 50, h: 10 }, show: ['live'] } },
  }
  set({ phase: 'live' })
  const { rerender } = renderStation(fake({ layout }))
  const ticker = screen.getByTestId('region-ticker')
  expect(ticker).toBeVisible()
  expect(ticker.style.left).toBe('0cqw')
  expect(ticker.style.top).toBe('0cqh')
  expect(ticker.style.width).toBe('50cqw')
  expect(ticker.style.height).toBe('10cqh')
  expect(screen.getByTestId('bc-stage').style.getPropertyValue('--box-left')).toBe('10')
  set({ phase: 'menus' })
  rerender()
  expect(screen.getByTestId('region-ticker')).not.toBeVisible()
})

test('the default layout feeds the scorebug edge from the window game rect', () => {
  set({ phase: 'live' })
  renderStation(fake())
  expect(screen.getByTestId('bc-stage').style.getPropertyValue('--box-left')).toBe(String(DEFAULT_LAYOUT.game.window.x))
})

test('postgame gets onPostgameDone only during tailgate', () => {
  set({ phase: 'menus' })
  const Postgame = ({ onPostgameDone }: SlotProps<Fake>) => (
    <button type="button" data-testid="postgame" data-done={String(onPostgameDone !== undefined)} onClick={onPostgameDone}>
      DONE
    </button>
  )
  const onTailgateFinal = vi.fn()
  const { rerender } = renderStation(fake({ slots: { Postgame } }), { onTailgateFinal })
  expect(screen.getByTestId('postgame')).toHaveAttribute('data-done', 'false')
  rerender({ tailgate: true })
  expect(screen.getByTestId('postgame')).toHaveAttribute('data-done', 'true')
  fireEvent.click(screen.getByTestId('postgame'))
  expect(onTailgateFinal).toHaveBeenCalledTimes(1)
})

test('package actions arrive as pulses', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set((next += 1), cb)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  let pads: Gamepad[] = []
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads })
  const held = (...buttons: number[]) => [{ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })) } as unknown as Gamepad]
  const tick = () =>
    act(() => {
      const due = [...frames.values()]
      frames.clear()
      for (const run of due) run(0)
    })
  set({ phase: 'live' })
  pulses = []
  renderStation(fake({ controls: { actions: [{ id: 'flip', keys: ['KeyQ'], pad: [0] }] } }))
  expect(pulses.at(-1)).toBeNull()
  expect(frames.size).toBeGreaterThan(0)
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }))
  })
  expect(pulses.at(-1)).toEqual({ id: 'flip', n: 1 })
  pads = held(0)
  tick()
  pads = held()
  tick()
  expect(pulses.at(-1)).toEqual({ id: 'flip', n: 2 })
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'BracketRight' }))
  })
  expect(pulses.at(-1)).toEqual({ id: 'flip', n: 2 })
})

test('without pad-bound package actions nothing polls the pad outside the window', () => {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  set({ phase: 'live' })
  const { rerender } = renderStation(fake())
  expect(frames).toHaveLength(0)
  set({ phase: 'window' })
  rerender()
  expect(frames.length).toBeGreaterThan(0)
})

test('the canvas slot element survives boxing and unboxing', () => {
  const slot = vi.fn()
  set({ phase: 'live' })
  const { rerender } = renderStation(full(), { canvasSlot: slot })
  set({ phase: 'window' })
  rerender()
  set({ phase: 'live' })
  rerender()
  expect(slot.mock.calls.filter(([node]) => node === null)).toHaveLength(0)
})

test('on the menus the league ticker shows under the game', () => {
  set({ phase: 'menus' })
  renderStation(fake())
  expect(screen.getByTestId('bc-stage')).toHaveAttribute('data-phase', 'menus')
  expect(screen.getByTestId('region-ticker')).toBeVisible()
  expect(screen.getByTestId('around-the-league')).toBeVisible()
  expect(screen.queryByTestId('scorebug')).toBeNull()
})

test('the watermark shows only while the game is full size', () => {
  set({ phase: 'live' })
  const { rerender } = renderStation(fake())
  expect(screen.getByTestId('watermark')).toBeInTheDocument()
  expect(screen.getByTestId('watermark').querySelector('.wordmark-c3 .wm-stripes')).not.toBeNull()
  expect(screen.getByTestId('watermark').querySelector('.wordmark-c2')).toBeNull()
  set({ phase: 'window' })
  rerender()
  expect(screen.getByTestId('watermark')).not.toBeVisible()
})

test('in tailgate mode the game holds while the package asks for the hold time plus a second', () => {
  vi.useFakeTimers()
  const emulator = { pause: vi.fn(), resume: vi.fn() } as unknown as Emulator
  const pkg = fake({ tailgate: { label: 'GO', script: () => [], hold: (d) => d.hold === true, holdMs: () => 0, finished: () => false } })
  set({ phase: 'live' })
  const { rerender } = renderStation(pkg, { emulator, tailgate: true })
  set({ phase: 'window' })
  rerender()
  expect(emulator.pause).not.toHaveBeenCalled()
  set({ phase: 'window', hold: true })
  rerender()
  expect(emulator.pause).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(TAIL_MS - 1))
  expect(emulator.resume).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(emulator.resume).toHaveBeenCalledTimes(1)
  set({ phase: 'live' })
  rerender()
  expect(emulator.resume).toHaveBeenCalledTimes(1)
})

test('save toasts are lifted to the caller', () => {
  const toast = vi.fn()
  set({ phase: 'live' })
  renderStation(fake(), { toast })
  expect(toast).toHaveBeenLastCalledWith(null)
})

test('AroundTheLeague keeps a network band up for null or no games', () => {
  const { rerender } = render(<LeagueTicker games={null} />)
  expect(screen.getByTestId('around-the-league')).toHaveTextContent('8-BIT SPORTS NETWORK')
  expect(screen.getByTestId('around-the-league').querySelector('.wordmark')).not.toBeNull()
  expect(screen.queryByTestId('league-game')).toBeNull()
  rerender(<LeagueTicker games={[]} entering />)
  expect(screen.getByTestId('around-the-league')).toHaveTextContent('8-BIT SPORTS NETWORK')
  expect(screen.getByTestId('around-the-league')).toHaveClass('league-enter')
})

test('the wordmark sits at the right end of the league ticker', () => {
  const game = { id: 'KC@BUF', away: { abbr: 'KC', score: 24 }, home: { abbr: 'BUF', score: 17 }, state: 'in' as const, detail: '4th 2:10', date: '2026-10-18T17:00Z' }
  render(<LeagueTicker games={[game]} />)
  const ticker = screen.getByTestId('around-the-league')
  const mark = ticker.querySelector('.wordmark')
  const roll = ticker.querySelector('.league-roll')!
  expect(mark).not.toBeNull()
  expect(roll.contains(mark)).toBe(false)
  expect(ticker.lastElementChild!.contains(mark)).toBe(true)
  expect(roll.compareDocumentPosition(mark!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('the league ticker fades without moving when reduced motion is asked for', () => {
  const station = readFileSync('src/broadcast/station.css', 'utf8')
  const calm = station.slice(station.indexOf('@media (prefers-reduced-motion: reduce)'))
  expect(calm).toMatch(/\.league-enter \{\s*animation-name: league-fade-in;/)
  const fade = station.slice(station.indexOf('@keyframes league-fade-in'), station.indexOf('@media (prefers-reduced-motion: reduce)'))
  expect(fade).not.toContain('transform')
})

test('the boxed game and the left region share one edge, and the stage keeps a scorebug edge default', () => {
  const station = readFileSync('src/broadcast/station.css', 'utf8')
  const { game, regions } = DEFAULT_LAYOUT
  expect(station).toMatch(new RegExp(`\\.bc-stage \\{[^}]*--box-left: ${game.window.x};`))
  expect(regions.left.rect.x + regions.left.rect.w).toBe(game.window.x + game.window.w)
})
