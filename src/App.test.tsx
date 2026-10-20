import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { Emulator } from './emu/Emulator'
import { fetchLeague } from './league/espn'
import { romStore } from './rom/romStore'
import { STAY_MS } from './tailgate/LeaveTailgate'
import { SETTLE_MS } from './tailgate/useTailgate'

vi.mock('./rom/romStore', () => ({ romStore: { load: vi.fn(), loadAll: vi.fn(), save: vi.fn(), select: vi.fn(), remove: vi.fn(), clear: vi.fn() } }))
vi.mock('./league/espn', () => ({ fetchLeague: vi.fn(), fetchStandings: vi.fn() }))
vi.mock('./rom/validateRom', async (importOriginal) => {
  const [pkg] = (await import('./packages/registry')).PACKAGES
  return { ...(await importOriginal<typeof import('./rom/validateRom')>()), validateRom: vi.fn(async () => ({ ok: true, rom: pkg.roms[0], pkg })) }
})

const fakeEmulator = (audio: boolean) =>
  ({
    resumeAudio: vi.fn(async () => audio),
    audioRunning: () => audio,
    onAudioChange: () => () => undefined,
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    readSnapshot: () => false,
    setAutoInput: vi.fn(),
    autoplay: vi.fn(),
    setHumanInput: vi.fn(),
  }) as unknown as Emulator

beforeEach(() => {
  vi.mocked(romStore.load).mockResolvedValue(null)
  vi.mocked(romStore.clear).mockResolvedValue()
  vi.mocked(romStore.loadAll).mockResolvedValue([])
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

test('the start screen carries the C3 wordmark named for the network', async () => {
  render(<App />)
  const chrome = document.querySelector('.chrome') as HTMLElement
  expect(chrome.querySelector('[aria-label="8BSN"]')).not.toBeNull()
  expect(chrome.querySelectorAll('.wm-stripe')).toHaveLength(3)
  expect(within(chrome).getByRole('heading', { name: '8-Bit Sports Network' })).toBeInTheDocument()
})

test('the start screen centers the wordmark and the buttons', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  render(<App />)
  const start = document.querySelector('.start') as HTMLElement
  await screen.findByRole('button', { name: 'START' })
  expect(start.querySelector('[aria-label="8BSN"]')).not.toBeNull()
  const css = readFileSync('src/app.css', 'utf8')
  const rule = /\.start\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  expect(rule).toMatch(/align-items:\s*center/)
  expect(rule).toMatch(/justify-content:\s*center/)
})

test('a stored ROM shows START with the game selector below and no remove option', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  render(<App />)
  const primary = await screen.findByRole('button', { name: 'START' })
  const manager = screen.getByRole('button', { name: 'SWITCH GAME' })
  expect(primary).toHaveFocus()
  expect(primary.compareDocumentPosition(manager) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'REMOVE ROM' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'CHANGE ROM' })).toBeNull()
  expect(screen.queryByLabelText(/rom file/i)).toBeNull()
})

test('no press any button prompt', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  render(<App />)
  await screen.findByRole('button', { name: 'START' })
  expect(screen.queryByText(/press any button/i)).toBeNull()
  expect(readFileSync('src/App.tsx', 'utf8')).not.toMatch(/PRESS ANY BUTTON/)
})

test('with no ROM stored GET STARTED shows and no start button', async () => {
  render(<App />)
  expect(await screen.findByRole('button', { name: 'GET STARTED' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'START' })).toBeNull()
})

test('clicks inside the chrome panel and keys do not start the game, START does', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const start = vi.spyOn(Emulator, 'start').mockResolvedValue(fakeEmulator(true))
  render(<App />)
  await screen.findByRole('button', { name: 'START' })
  fireEvent.click(within(document.querySelector('.chrome') as HTMLElement).getByRole('heading', { name: '8-Bit Sports Network' }))
  fireEvent.click(document.querySelector('.start') as HTMLElement)
  key('KeyX')
  expect(start).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'START' }))
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1))
})

test('the arrows move focus and Enter on the focused button activates it', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  render(<App />)
  const primary = await screen.findByRole('button', { name: 'START' })
  const change = screen.getByRole('button', { name: 'SWITCH GAME' })
  const tailgate = screen.getByRole('button', { name: 'TAILGATE' })
  expect(primary).toHaveFocus()
  key('ArrowDown')
  expect(tailgate).toHaveFocus()
  key('ArrowDown')
  expect(change).toHaveFocus()
  key('ArrowRight')
  expect(screen.getByRole('button', { name: 'INFO' })).toHaveFocus()
  key('ArrowRight')
  expect(screen.getByRole('button', { name: 'INFO' })).toHaveFocus()
  key('ArrowLeft')
  expect(change).toHaveFocus()
  key('ArrowUp')
  expect(tailgate).toHaveFocus()
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
  const primary = await screen.findByRole('button', { name: 'START' })
  const change = screen.getByRole('button', { name: 'SWITCH GAME' })
  const tick = (...buttons: number[]) => {
    held = buttons
    const cb = frames.pop()
    act(() => cb?.(0))
  }
  const tailgate = screen.getByRole('button', { name: 'TAILGATE' })
  tick()
  tick(13)
  expect(tailgate).toHaveFocus()
  tick(13)
  expect(tailgate).toHaveFocus()
  tick()
  tick(13)
  expect(change).toHaveFocus()
  tick()
  tick(12)
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

test('TAILGATE runs the game without the start screen, and input asks before leaving', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const running = fakeEmulator(true)
  const start = vi.spyOn(Emulator, 'start').mockResolvedValue(running)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'TAILGATE' }))
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByRole('button', { name: 'RESUME', hidden: true })).not.toBeVisible())
  expect(running.setHumanInput).toHaveBeenCalledWith(false)
  key('KeyX')
  expect(screen.queryByRole('dialog', { name: 'LEAVE THE TAILGATE?' })).toBeNull()
  await act(() => new Promise((resolve) => setTimeout(resolve, SETTLE_MS)))
  key('KeyX')
  expect(screen.getByRole('dialog', { name: 'LEAVE THE TAILGATE?' })).toBeInTheDocument()
  expect(running.pause).not.toHaveBeenCalled()
  expect(running.stop).not.toHaveBeenCalled()
  key('ArrowRight')
  key('Enter')
  expect(screen.queryByRole('dialog', { name: 'LEAVE THE TAILGATE?' })).toBeNull()
  expect(running.stop).not.toHaveBeenCalled()
  key('Space')
  key('Enter')
  expect(running.stop).toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'START' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'TAILGATE' })).toBeVisible()
})

test('the leave question goes away on its own and the tailgate carries on', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const running = fakeEmulator(true)
  vi.spyOn(Emulator, 'start').mockResolvedValue(running)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'TAILGATE' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'RESUME', hidden: true })).not.toBeVisible())
  await act(() => new Promise((resolve) => setTimeout(resolve, SETTLE_MS)))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  key('KeyX')
  expect(screen.getByRole('dialog', { name: 'LEAVE THE TAILGATE?' })).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(STAY_MS))
  expect(screen.queryByRole('dialog', { name: 'LEAVE THE TAILGATE?' })).toBeNull()
  expect(running.stop).not.toHaveBeenCalled()
  vi.useRealTimers()
})

test('TAILGATE is only offered when no game is running', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  vi.spyOn(Emulator, 'start').mockResolvedValue(fakeEmulator(true))
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'START' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'RESUME', hidden: true })).not.toBeVisible())
  key('KeyR')
  expect(screen.queryByRole('button', { name: 'TAILGATE' })).toBeNull()
})

test('mid game the primary button reads RESUME', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  vi.spyOn(Emulator, 'start').mockResolvedValue(fakeEmulator(true))
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'START' }))
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

test('the game selector opens over the start screen and its keys and clicks do not start the game', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const start = vi.spyOn(Emulator, 'start').mockResolvedValue(fakeEmulator(true))
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'SWITCH GAME' }))
  const dialog = await screen.findByRole('dialog', { name: 'GAME SELECTOR' })
  key('KeyX', dialog)
  fireEvent.click(within(dialog).getByRole('button', { name: 'CLOSE' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(start).not.toHaveBeenCalled()
})

test('KeyR opens the ROM controls over a running game and Escape closes them', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const emu = fakeEmulator(true)
  vi.spyOn(Emulator, 'start').mockResolvedValue(emu)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'START' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'SWITCH GAME', hidden: true })).not.toBeVisible())
  expect(emu.pause).not.toHaveBeenCalled()
  key('KeyR')
  expect(screen.getByRole('button', { name: 'SWITCH GAME' })).toBeVisible()
  expect(emu.pause).toHaveBeenCalledTimes(1)
  expect(emu.resume).not.toHaveBeenCalled()
  key('Escape')
  expect(screen.getByRole('button', { name: 'SWITCH GAME', hidden: true })).not.toBeVisible()
  expect(emu.resume).toHaveBeenCalledTimes(1)
  expect(emu.stop).not.toHaveBeenCalled()
})

test('a click or key turns sound on when a pad started the game without sound', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const emu = fakeEmulator(false)
  vi.spyOn(Emulator, 'start').mockResolvedValue(emu)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'START' }))
  expect(await screen.findByText('CLICK OR PRESS A KEY TO TURN ON SOUND')).toBeInTheDocument()
  key('KeyX')
  await waitFor(() => expect(emu.resumeAudio).toHaveBeenCalledTimes(2))
})

test('toggling prefs does not refetch the league', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  render(<App />)
  await screen.findByRole('button', { name: 'START' })
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

test('the league ticker shows scores before any ROM is loaded', async () => {
  vi.mocked(fetchLeague).mockResolvedValue([{ id: '1', away: { abbr: 'AAA', score: 7 }, home: { abbr: 'BBB', score: 3 }, state: 'post', detail: 'Final', date: '' }])
  render(<App />)
  expect(await screen.findByTestId('league-game')).toHaveTextContent('AAA 7 BBB 3 FINAL')
})

test('the start screen links to GitHub and the build commit', async () => {
  render(<App />)
  expect(screen.getByRole('link', { name: 'GITHUB' })).toHaveAttribute('href', 'https://github.com/BrandonKowalski/8BSN')
  expect(screen.getByTitle('Build commit')).toHaveAttribute('href', expect.stringMatching(/^https:\/\/github\.com\/BrandonKowalski\/8BSN\/commit\//))
})

test('INFO opens credits with every supported ROM fingerprint and Escape closes it', async () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'INFO' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('SHA-1 25ab46078b26380cab04bac01bf9b1c5a2efa432')).toBeInTheDocument()
  expect(within(dialog).getByText('SHA-1 0f0284970cffc719c9993a9303e72077c0f8513a')).toBeInTheDocument()
  expect(within(dialog).getByText(/Mesen by Sour/)).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'CLOSE' })).toHaveFocus()
  fireEvent.keyDown(window, { code: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})
