import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { Emulator } from './emu/Emulator'
import { PlayTracker } from './game/playTracker'
import { fetchLeague } from './league/espn'
import { romStore } from './rom/romStore'

vi.mock('./rom/romStore', () => ({ romStore: { load: vi.fn(), save: vi.fn(), clear: vi.fn() } }))
vi.mock('./league/espn', () => ({ fetchLeague: vi.fn() }))
vi.mock('./game/useGame', () => ({
  useGame: () => ({ state: null, tracker: new PlayTracker({ recordRoutes: false }), events: [], generation: 0, names: () => '', player: () => null }),
}))

const fakeEmulator = (audio: boolean) =>
  ({
    resumeAudio: vi.fn(async () => audio),
    audioRunning: () => audio,
    onAudioChange: () => () => undefined,
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    readSnapshot: () => false,
  }) as unknown as Emulator

beforeEach(() => {
  vi.mocked(romStore.load).mockResolvedValue(null)
  vi.mocked(romStore.clear).mockResolvedValue()
  vi.mocked(fetchLeague).mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

const key = (code: string, target: EventTarget = window) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
  })

test('the start screen carries the C3 wordmark and network name', async () => {
  render(<App />)
  const chrome = document.querySelector('.chrome') as HTMLElement
  expect(chrome.querySelector('[aria-label="8BSN"]')).not.toBeNull()
  expect(chrome.querySelectorAll('.wm-stripe')).toHaveLength(3)
  expect(within(chrome).getByText('8-BIT SPORTS NETWORK')).toBeInTheDocument()
})

test('the start screen centers the wordmark and the buttons', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  render(<App />)
  const start = document.querySelector('.start') as HTMLElement
  await screen.findByRole('button', { name: 'START GAME' })
  expect(start.querySelector('[aria-label="8BSN"]')).not.toBeNull()
  const css = readFileSync('src/app.css', 'utf8')
  const rule = /\.start\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  expect(rule).toMatch(/align-items:\s*center/)
  expect(rule).toMatch(/justify-content:\s*center/)
})

test('a stored ROM shows START GAME with change and remove below', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  render(<App />)
  const primary = await screen.findByRole('button', { name: 'START GAME' })
  const change = screen.getByRole('button', { name: 'CHANGE ROM' })
  const remove = screen.getByRole('button', { name: 'REMOVE ROM' })
  expect(primary).toHaveFocus()
  expect(primary.compareDocumentPosition(change) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(change.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.queryByLabelText(/rom file/i)).toBeNull()
})

test('no press any button prompt', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  render(<App />)
  await screen.findByRole('button', { name: 'START GAME' })
  expect(screen.queryByText(/press any button/i)).toBeNull()
  expect(readFileSync('src/App.tsx', 'utf8')).not.toMatch(/PRESS ANY BUTTON/)
})

test('with no ROM stored the file picker shows and no start button', async () => {
  render(<App />)
  expect(await screen.findByLabelText(/rom file/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'START GAME' })).toBeNull()
})

test('clicks inside the chrome panel and keys do not start the game, START GAME does', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const start = vi.spyOn(Emulator, 'start').mockResolvedValue(fakeEmulator(true))
  render(<App />)
  await screen.findByRole('button', { name: 'START GAME' })
  fireEvent.click(within(document.querySelector('.chrome') as HTMLElement).getByText('8-BIT SPORTS NETWORK'))
  fireEvent.click(document.querySelector('.start') as HTMLElement)
  key('KeyX')
  expect(start).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'START GAME' }))
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1))
})

test('the arrows move focus and Enter on the focused button activates it', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  render(<App />)
  const primary = await screen.findByRole('button', { name: 'START GAME' })
  const change = screen.getByRole('button', { name: 'CHANGE ROM' })
  const remove = screen.getByRole('button', { name: 'REMOVE ROM' })
  expect(primary).toHaveFocus()
  key('ArrowDown')
  expect(change).toHaveFocus()
  key('ArrowRight')
  expect(remove).toHaveFocus()
  key('ArrowRight')
  expect(remove).toHaveFocus()
  key('ArrowLeft')
  expect(change).toHaveFocus()
  key('ArrowUp')
  expect(primary).toHaveFocus()
  key('ArrowUp')
  expect(primary).toHaveFocus()
})

test('the pad and arrows move focus and A starts the game', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const start = vi.spyOn(Emulator, 'start').mockResolvedValue(fakeEmulator(true))
  let held: number[] = []
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [{ buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: held.includes(i) })) }],
  })
  render(<App />)
  const primary = await screen.findByRole('button', { name: 'START GAME' })
  const change = screen.getByRole('button', { name: 'CHANGE ROM' })
  const tick = (...buttons: number[]) => {
    held = buttons
    const cb = frames.pop()
    act(() => cb?.(0))
  }
  tick()
  tick(13)
  expect(change).toHaveFocus()
  tick(13)
  expect(change).toHaveFocus()
  tick()
  tick(12)
  expect(primary).toHaveFocus()
  tick()
  expect(start).not.toHaveBeenCalled()
  tick(0)
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1))
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'getGamepads')
})

test('mid game the primary button reads RESUME', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  vi.spyOn(Emulator, 'start').mockResolvedValue(fakeEmulator(true))
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'START GAME' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'RESUME', hidden: true })).not.toBeVisible())
  key('KeyR')
  const resume = screen.getByRole('button', { name: 'RESUME' })
  expect(resume).toBeVisible()
  expect(resume).toHaveFocus()
  fireEvent.click(resume)
  expect(screen.getByRole('button', { name: 'RESUME', hidden: true })).not.toBeVisible()
})

test('App renders the broadcast view with the canvas slot', async () => {
  render(<App />)
  const view = screen.getByTestId('broadcast-view')
  expect(view.querySelector('canvas')).not.toBeNull()
  await waitFor(() => expect(romStore.load).toHaveBeenCalled())
})

test('CHANGE ROM works over the start screen and its keys and clicks do not start the game', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const start = vi.spyOn(Emulator, 'start').mockResolvedValue(fakeEmulator(true))
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'CHANGE ROM' }))
  const input = await screen.findByLabelText(/rom file/i)
  key('KeyX', input)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'CHANGE ROM' })).toBeInTheDocument()
  expect(screen.queryByLabelText(/rom file/i)).toBeNull()
  expect(start).not.toHaveBeenCalled()
})

test('KeyR opens the ROM controls over a running game and Escape closes them', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const emu = fakeEmulator(true)
  vi.spyOn(Emulator, 'start').mockResolvedValue(emu)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'START GAME' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'CHANGE ROM', hidden: true })).not.toBeVisible())
  expect(emu.pause).not.toHaveBeenCalled()
  key('KeyR')
  expect(screen.getByRole('button', { name: 'CHANGE ROM' })).toBeVisible()
  expect(emu.pause).toHaveBeenCalledTimes(1)
  expect(emu.resume).not.toHaveBeenCalled()
  key('Escape')
  expect(screen.getByRole('button', { name: 'CHANGE ROM', hidden: true })).not.toBeVisible()
  expect(emu.resume).toHaveBeenCalledTimes(1)
  expect(emu.stop).not.toHaveBeenCalled()
})

test('a click or key turns sound on when a pad started the game without sound', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const emu = fakeEmulator(false)
  vi.spyOn(Emulator, 'start').mockResolvedValue(emu)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'START GAME' }))
  expect(await screen.findByText('CLICK OR PRESS A KEY TO TURN ON SOUND')).toBeInTheDocument()
  key('KeyX')
  await waitFor(() => expect(emu.resumeAudio).toHaveBeenCalledTimes(2))
})

test('toggling prefs does not refetch the league', async () => {
  render(<App />)
  key('KeyP')
  key('KeyP')
  key('KeyP')
  expect(screen.getByTestId('broadcast-view')).toBeInTheDocument()
  await waitFor(() => expect(fetchLeague).toHaveBeenCalled())
  await act(async () => {
    await Promise.resolve()
  })
  expect(fetchLeague).toHaveBeenCalledTimes(1)
})
