import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { Emulator } from './emu/Emulator'
import { PlayTracker } from './game/playTracker'
import { fetchLeague } from './league/espn'
import { romStore } from './rom/romStore'

vi.mock('./rom/romStore', () => ({ romStore: { load: vi.fn(), save: vi.fn(), clear: vi.fn() } }))
vi.mock('./league/espn', () => ({ fetchLeague: vi.fn() }))
vi.mock('./game/useGame', () => ({
  useGame: () => ({ state: null, tracker: new PlayTracker({ recordRoutes: false }), events: [], names: () => '' }),
}))

const fakeEmulator = (audio: boolean) =>
  ({
    resumeAudio: vi.fn(async () => audio),
    audioRunning: () => audio,
    onAudioChange: () => () => undefined,
    stop: vi.fn(),
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

test('App renders the title and the broadcast view with the canvas slot', async () => {
  render(<App />)
  expect(screen.getByText('Tecmo Broadcast')).toBeInTheDocument()
  const view = screen.getByTestId('broadcast-view')
  expect(view.querySelector('canvas')).not.toBeNull()
  await waitFor(() => expect(romStore.load).toHaveBeenCalled())
})

test('Replace ROM works over the gate and its keys and clicks do not start the game', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const start = vi.spyOn(Emulator, 'start').mockResolvedValue(fakeEmulator(true))
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Replace ROM' }))
  const input = await screen.findByLabelText(/rom file/i)
  key('KeyX', input)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Replace ROM' })).toBeInTheDocument()
  expect(screen.queryByLabelText(/rom file/i)).toBeNull()
  expect(start).not.toHaveBeenCalled()
  expect(screen.getByText('Press any button or click to start')).toBeInTheDocument()
})

test('KeyR opens the ROM controls over a running game and Escape or Cancel closes them', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  const emu = fakeEmulator(true)
  vi.spyOn(Emulator, 'start').mockResolvedValue(emu)
  render(<App />)
  await screen.findByRole('button', { name: 'Replace ROM' })
  fireEvent.click(screen.getByText('Press any button or click to start'))
  await waitFor(() => expect(screen.queryByText('Press any button or click to start')).toBeNull())
  expect(screen.getByRole('button', { name: 'Replace ROM', hidden: true })).not.toBeVisible()
  key('KeyR')
  expect(screen.getByRole('button', { name: 'Replace ROM' })).toBeVisible()
  key('Escape')
  expect(screen.getByRole('button', { name: 'Replace ROM', hidden: true })).not.toBeVisible()
  key('KeyR')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Replace ROM', hidden: true })).not.toBeVisible()
  expect(emu.stop).not.toHaveBeenCalled()
})

test('the gate asks for a click or key when a pad started the game without sound', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([1]))
  vi.spyOn(Emulator, 'start').mockResolvedValue(fakeEmulator(false))
  render(<App />)
  await screen.findByRole('button', { name: 'Replace ROM' })
  expect(screen.queryByText('Click or press a key to turn on sound')).toBeNull()
  key('KeyX')
  expect(await screen.findByText('Click or press a key to turn on sound')).toBeInTheDocument()
  expect(screen.getByText('Press any button or click to start')).toBeInTheDocument()
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
