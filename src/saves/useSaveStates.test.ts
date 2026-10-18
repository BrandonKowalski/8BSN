import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { GameSidecar } from '../game/useGame'
import { TARGET_ROM_SHA1 } from '../rom/validateRom'
import { startupSlot, useSaveStates } from './useSaveStates'

const SIDECAR = { tracker: { plays: [{ index: 0 }] }, lastInGame: null } as unknown as GameSidecar
const CORE = new Uint8Array([1, 2, 3])

let files: Map<string, Uint8Array | string>

beforeEach(() => {
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
  const emulator = { saveState: vi.fn(async () => CORE), loadState: vi.fn(async () => undefined) }
  const game = { sidecar: vi.fn(() => SIDECAR), restore: vi.fn() }
  const hook = renderHook(() => useSaveStates(emulator, game, enabled))
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
  expect(emulator.loadState).toHaveBeenCalledWith(new Uint8Array(CORE))
  expect(game.restore).toHaveBeenCalledWith(SIDECAR)
})

test('loading an empty slot says so and touches nothing', async () => {
  const { emulator, game, hook } = setup()
  press('Digit1')
  await waitFor(() => expect(hook.result.current).toBe('NO SAVE 1'))
  expect(emulator.loadState).not.toHaveBeenCalled()
  expect(game.restore).not.toHaveBeenCalled()
})

test('a save from another ROM is refused', async () => {
  files.set('/__states/slot-4.state', CORE)
  files.set('/__states/slot-4.json', JSON.stringify({ rom: 'other', savedAt: '', sidecar: SIDECAR }))
  const { emulator, hook } = setup()
  press('Digit4')
  await waitFor(() => expect(hook.result.current).toBe('SAVE 4 IS FROM ANOTHER ROM'))
  expect(emulator.loadState).not.toHaveBeenCalled()
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
  files.set('/__states/slot-2.json', JSON.stringify({ rom: TARGET_ROM_SHA1, savedAt: '', sidecar: SIDECAR }))
  window.history.replaceState(null, '', '/?state=2')
  const { game, hook } = setup()
  await waitFor(() => expect(hook.result.current).toBe('LOADED 2'))
  expect(game.restore).toHaveBeenCalledWith(SIDECAR)
})

test('startupSlot accepts slots 1 to 4 only', () => {
  expect(startupSlot('?state=1')).toBe(1)
  expect(startupSlot('?state=4')).toBe(4)
  expect(startupSlot('?state=5')).toBeNull()
  expect(startupSlot('?state=x')).toBeNull()
  expect(startupSlot('')).toBeNull()
})
