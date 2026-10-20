import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PACKAGES } from '../packages/registry'
import { romStore } from './romStore'
import StartPanel from './StartPanel'
import { validateRom } from './validateRom'

vi.mock('./validateRom', () => ({ validateRom: vi.fn() }))
vi.mock('./romStore', () => ({ romStore: { load: vi.fn(), loadAll: vi.fn(), save: vi.fn(), select: vi.fn(), remove: vi.fn(), clear: vi.fn() } }))

const TSB = PACKAGES[0]
const [NEWER, OLDER] = TSB.roms
const STORED = new Uint8Array([1])

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(romStore.loadAll).mockResolvedValue([STORED])
  vi.mocked(romStore.save).mockResolvedValue(true)
  vi.mocked(validateRom).mockImplementation(async (bytes) => (bytes[0] === 1 ? { ok: true, rom: NEWER, pkg: TSB } : bytes[0] === 2 ? { ok: true, rom: OLDER, pkg: TSB } : { ok: false, reason: 'not-nes' }))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function show(running = false) {
  const onLaunch = vi.fn()
  const onResume = vi.fn()
  render(<StartPanel running={running} onLaunch={onLaunch} onResume={onResume} />)
  return { onLaunch, onResume }
}

const game = () => screen.getByRole('combobox', { name: 'GAME' }) as HTMLSelectElement

test('the dropdown lists every supported ROM and a stored one offers PLAY and TAILGATE', async () => {
  const { onLaunch } = show()
  expect([...game().options].map((o) => o.textContent)).toEqual(['Tecmo Super Bowl 2026', 'Tecmo Super Bowl'])
  fireEvent.click(await screen.findByRole('button', { name: 'TAILGATE' }))
  expect(onLaunch).toHaveBeenCalledWith({ bytes: STORED, rom: NEWER, pkg: TSB }, 'tailgate')
})

test('a ROM that is not stored offers UPLOAD ROM, then PLAY once uploaded', async () => {
  const { onLaunch } = show()
  await screen.findByRole('button', { name: 'PLAY' })
  fireEvent.change(game(), { target: { value: OLDER.sha1 } })
  expect(screen.queryByRole('button', { name: 'PLAY' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'UPLOAD ROM' }))
  fireEvent.change(screen.getByLabelText('ROM file'), { target: { files: [new File([new Uint8Array([2])], 'x.nes')] } })
  fireEvent.click(await screen.findByRole('button', { name: 'PLAY' }))
  expect(romStore.save).toHaveBeenCalledWith(expect.any(Uint8Array), OLDER.sha1)
  expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ rom: OLDER }), 'play')
})

test('the wrong file is refused with a message', async () => {
  show()
  fireEvent.change(game(), { target: { value: OLDER.sha1 } })
  fireEvent.click(await screen.findByRole('button', { name: 'UPLOAD ROM' }))
  fireEvent.change(screen.getByLabelText('ROM file'), { target: { files: [new File([new Uint8Array([9])], 'x.nes')] } })
  expect(await screen.findByRole('alert')).toHaveTextContent("That doesn't look like an NES ROM.")
})

test('left and right change the game while the dropdown is focused', async () => {
  show()
  game().focus()
  fireEvent.keyDown(game(), { code: 'ArrowRight' })
  expect(game().value).toBe(OLDER.sha1)
  fireEvent.keyDown(game(), { code: 'ArrowLeft' })
  expect(game().value).toBe(NEWER.sha1)
})

test('the last game and button are picked again next time', async () => {
  const first = show()
  fireEvent.click(await screen.findByRole('button', { name: 'TAILGATE' }))
  expect(first.onLaunch).toHaveBeenCalled()
  cleanup()
  show()
  expect(game().value).toBe(NEWER.sha1)
  await waitFor(() => expect(screen.getByRole('button', { name: 'TAILGATE' })).toHaveFocus())
})

test('with a game running RESUME comes first', async () => {
  const { onResume } = show(true)
  await screen.findByRole('button', { name: 'PLAY' })
  expect(screen.getByRole('button', { name: 'RESUME' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'RESUME' }))
  expect(onResume).toHaveBeenCalled()
})
