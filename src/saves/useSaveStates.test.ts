import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { TARGET_ROM_SHA1 } from '../rom/validateRom'
import { SAVE_VERSION } from './saveSlots'
import { startupSlot, useSaveStates } from './useSaveStates'

const SIDECAR = { tracker: { plays: [{ index: 0 }] }, lastInGame: null } as unknown
const CORE = new Uint8Array([1, 2, 3])
const RECORDING = {
  origin: 1200,
  inputs: new Uint16Array([1, 2, 3, 4, 65535, 0]),
  hashes: new Uint32Array([0xdeadbeef, 7, 0xffffffff]),
  snaps: [[1201, new Uint8Array([9, 8, 7])]] as [number, Uint8Array][],
}

let files: Map<string, Uint8Array | string>

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  files = new Map()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        files.set(url, init.body as Uint8Array | string)
        return new Response(null, { status: 204 })
      }
      const body = files.get(url)
      return body === undefined ? new Response(null, { status: 404 }) : new Response(body as BodyInit)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

function setup(enabled = true) {
  const emulator = { saveState: vi.fn(async () => ({ core: CORE, frame: 1202, recording: RECORDING })), loadState: vi.fn(async () => undefined) }
  const game = { save: vi.fn(() => SIDECAR), restore: vi.fn(), suspend: vi.fn(), resume: vi.fn() }
  const hook = renderHook(() => useSaveStates(emulator, game, enabled, TARGET_ROM_SHA1, 'tsb'))
  return { emulator, game, hook }
}

const press = (code: string, altKey = false) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { code, altKey })))

test('option and a number saves the core state and the sidecar to that slot', async () => {
  const { hook } = setup()
  press('Digit2', true)
  await waitFor(() => expect(hook.result.current).toBe('SAVED 2'))
  expect(files.get('/__states/slot-2.state')).toEqual(CORE)
  const meta = JSON.parse(files.get('/__states/slot-2.json') as string)
  expect(meta.rom).toBe(TARGET_ROM_SHA1)
  expect(meta.sidecar).toEqual(SIDECAR)
})

test('a number loads the core state and restores the sidecar', async () => {
  const { emulator, game, hook } = setup()
  press('Digit3', true)
  await waitFor(() => expect(hook.result.current).toBe('SAVED 3'))
  press('Digit3')
  await waitFor(() => expect(hook.result.current).toBe('LOADED 3'))
  expect(emulator.loadState).toHaveBeenCalledWith(new Uint8Array(CORE), 1202, RECORDING)
  expect(game.restore).toHaveBeenCalledWith(SIDECAR, 1202)
})

test('a load holds the game from before the core load until the restore', async () => {
  const { emulator, game, hook } = setup()
  press('Digit3', true)
  await waitFor(() => expect(hook.result.current).toBe('SAVED 3'))
  const order: string[] = []
  game.suspend.mockImplementation(() => void order.push('suspend'))
  emulator.loadState.mockImplementation(async () => void order.push('load'))
  game.restore.mockImplementation(() => void order.push('restore'))
  press('Digit3')
  await waitFor(() => expect(hook.result.current).toBe('LOADED 3'))
  expect(order).toEqual(['suspend', 'load', 'restore'])
})

test('a failed load resumes the game without a restore', async () => {
  const { emulator, game, hook } = setup()
  press('Digit3', true)
  await waitFor(() => expect(hook.result.current).toBe('SAVED 3'))
  emulator.loadState.mockRejectedValueOnce(new Error('worker gone'))
  press('Digit3')
  await waitFor(() => expect(hook.result.current).toBe('LOAD 3 FAILED'))
  expect(game.suspend).toHaveBeenCalledTimes(1)
  expect(game.resume).toHaveBeenCalledTimes(1)
  expect(game.restore).not.toHaveBeenCalled()
})

test('loading an empty slot says so and touches nothing', async () => {
  const { emulator, game, hook } = setup()
  press('Digit1')
  await waitFor(() => expect(hook.result.current).toBe('NO SAVE 1'))
  expect(emulator.loadState).not.toHaveBeenCalled()
  expect(game.restore).not.toHaveBeenCalled()
  expect(game.suspend).not.toHaveBeenCalled()
})

test('a save from another ROM is refused', async () => {
  files.set('/__states/slot-4.state', CORE)
  files.set('/__states/slot-4.json', JSON.stringify({ rom: 'other', savedAt: '', sidecar: SIDECAR }))
  const { emulator, hook } = setup()
  press('Digit4')
  await waitFor(() => expect(hook.result.current).toBe('SAVE 4 IS FROM ANOTHER ROM'))
  expect(emulator.loadState).not.toHaveBeenCalled()
})

test('a save without a package field loads into the package claiming its ROM, with its sidecar', async () => {
  files.set('/__states/slot-2.state', CORE)
  files.set('/__states/slot-2.json', JSON.stringify({ rom: TARGET_ROM_SHA1, savedAt: '', sidecar: SIDECAR, version: SAVE_VERSION }))
  const { emulator, game, hook } = setup()
  press('Digit2')
  await waitFor(() => expect(hook.result.current).toBe('LOADED 2'))
  expect(emulator.loadState).toHaveBeenCalled()
  expect(game.restore).toHaveBeenCalledWith(SIDECAR, 0)
})

test('a save from another package is refused with a toast', async () => {
  files.set('/__states/slot-2.state', CORE)
  files.set('/__states/slot-2.json', JSON.stringify({ rom: TARGET_ROM_SHA1, package: 'other', savedAt: '', sidecar: SIDECAR, version: SAVE_VERSION }))
  const { emulator, game, hook } = setup()
  press('Digit2')
  await waitFor(() => expect(hook.result.current).toBe('SAVE 2 IS FROM ANOTHER PACKAGE'))
  expect(emulator.loadState).not.toHaveBeenCalled()
  expect(game.suspend).not.toHaveBeenCalled()
  expect(game.restore).not.toHaveBeenCalled()
})

test('saves record the package id', async () => {
  const { hook } = setup()
  press('Digit2', true)
  await waitFor(() => expect(hook.result.current).toBe('SAVED 2'))
  expect(JSON.parse(files.get('/__states/slot-2.json') as string).package).toBe('tsb')
})

test('keys do nothing while disabled or past slot 4', async () => {
  const { emulator } = setup(false)
  press('Digit1', true)
  const live = setup()
  press('Digit5', true)
  await Promise.resolve()
  expect(emulator.saveState).not.toHaveBeenCalled()
  expect(live.emulator.saveState).not.toHaveBeenCalled()
})

test('the state query loads that slot at startup', async () => {
  files.set('/__states/slot-2.state', CORE)
  files.set('/__states/slot-2.json', JSON.stringify({ rom: TARGET_ROM_SHA1, savedAt: '', sidecar: SIDECAR, version: SAVE_VERSION }))
  window.history.replaceState(null, '', '/?state=2')
  const { game, hook } = setup()
  await waitFor(() => expect(hook.result.current).toBe('LOADED 2'))
  expect(game.restore).toHaveBeenCalledWith(SIDECAR, 0)
})

test('saving writes the frame and recording and loading hands them back to the emulator', async () => {
  const { emulator, hook } = setup()
  press('Digit1', true)
  await waitFor(() => expect(hook.result.current).toBe('SAVED 1'))
  const meta = JSON.parse(files.get('/__states/slot-1.json') as string)
  expect(meta.frame).toBe(1202)
  expect(typeof meta.recording.inputs).toBe('string')
  press('Digit1')
  await waitFor(() => expect(hook.result.current).toBe('LOADED 1'))
  const [core, frame, recording] = emulator.loadState.mock.calls[0] as unknown as [Uint8Array, number, typeof RECORDING]
  expect(core).toEqual(CORE)
  expect(frame).toBe(1202)
  expect(recording.origin).toBe(1200)
  expect(recording.inputs).toBeInstanceOf(Uint16Array)
  expect(recording.hashes).toBeInstanceOf(Uint32Array)
  expect(Array.from(recording.inputs)).toEqual(Array.from(RECORDING.inputs))
  expect(Array.from(recording.hashes)).toEqual(Array.from(RECORDING.hashes))
  expect(recording.snaps[0][0]).toBe(1201)
  expect(recording.snaps[0][1]).toBeInstanceOf(Uint8Array)
  expect(Array.from(recording.snaps[0][1])).toEqual([9, 8, 7])
})

test('an old save without a recording loads at frame zero with no recording', async () => {
  files.set('/__states/slot-3.state', CORE)
  files.set('/__states/slot-3.json', JSON.stringify({ rom: TARGET_ROM_SHA1, savedAt: '', sidecar: SIDECAR, version: SAVE_VERSION }))
  const { emulator, hook } = setup()
  press('Digit3')
  await waitFor(() => expect(hook.result.current).toBe('LOADED 3'))
  expect(emulator.loadState).toHaveBeenCalledWith(new Uint8Array(CORE), 0, null)
})

test('an old save restores the game, resets the stats and says so', async () => {
  const timeout = vi.spyOn(window, 'setTimeout')
  files.set('/__states/slot-1.state', CORE)
  files.set('/__states/slot-1.json', JSON.stringify({ rom: TARGET_ROM_SHA1, savedAt: '', sidecar: SIDECAR, frame: 1202, recording: null }))
  const { emulator, game, hook } = setup()
  press('Digit1')
  await waitFor(() => expect(hook.result.current).toBe('SAVE 1 IS FROM AN OLDER VERSION, STATS RESET'))
  expect(emulator.loadState).toHaveBeenCalledWith(new Uint8Array(CORE), 1202, null)
  expect(game.restore).toHaveBeenCalledWith(null, 1202)
  expect(timeout).toHaveBeenCalledWith(expect.any(Function), 3000)
  timeout.mockRestore()
})

test('a current save restores the stats', async () => {
  const { emulator, game, hook } = setup()
  press('Digit1', true)
  await waitFor(() => expect(hook.result.current).toBe('SAVED 1'))
  press('Digit1')
  await waitFor(() => expect(hook.result.current).toBe('LOADED 1'))
  expect(game.restore).toHaveBeenCalledWith(SIDECAR, 1202)
  expect((emulator.loadState.mock.calls[0] as unknown[])[2]).not.toBeNull()
})

test('saves carry the format version', async () => {
  const { hook } = setup()
  press('Digit2', true)
  await waitFor(() => expect(hook.result.current).toBe('SAVED 2'))
  expect(JSON.parse(files.get('/__states/slot-2.json') as string).version).toBe(SAVE_VERSION)
  expect(SAVE_VERSION).toBe(10)
})

test('startupSlot accepts slots 1 to 4 only', () => {
  expect(startupSlot('?state=1')).toBe(1)
  expect(startupSlot('?state=4')).toBe(4)
  expect(startupSlot('?state=5')).toBeNull()
  expect(startupSlot('?state=x')).toBeNull()
  expect(startupSlot('')).toBeNull()
})
