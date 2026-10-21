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
const HACK = new Uint8Array([3])
const unverified = (title: string) => ({ sha1: `hack-${title}`, title, about: TSB.scan!.about, unverified: true })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(romStore.loadAll).mockResolvedValue([{ bytes: STORED, title: null }])
  vi.mocked(romStore.save).mockResolvedValue(true)
  vi.mocked(validateRom).mockImplementation(async (bytes, _packages, title = 'Unknown ROM') => {
    if (bytes[0] === 1) return { ok: true, rom: NEWER, pkg: TSB }
    if (bytes[0] === 2) return { ok: true, rom: OLDER, pkg: TSB }
    if (bytes[0] === 3) return { ok: true, rom: unverified(title), pkg: TSB }
    if (bytes[0] === 4) return { ok: false, reason: 'wrong-rom', detail: 'its roster is odd' }
    return { ok: false, reason: 'not-nes' }
  })
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
  expect([...game().options].map((o) => o.textContent)).toEqual(['Tecmo Super Bowl 2026', 'Tecmo Super Bowl', 'OTHER ROM...'])
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

const upload = (bytes: Uint8Array<ArrayBuffer>, name: string) =>
  fireEvent.change(screen.getByLabelText('ROM file'), { target: { files: [new File([bytes], name)] } })

test('a stored unverified ROM is listed by its title before OTHER ROM and can be played', async () => {
  vi.mocked(romStore.loadAll).mockResolvedValue([{ bytes: STORED, title: null }, { bytes: HACK, title: 'TSB 2025 v4.0' }])
  const { onLaunch } = show()
  await waitFor(() => expect([...game().options].map((o) => o.textContent)).toEqual(['Tecmo Super Bowl 2026', 'Tecmo Super Bowl', 'TSB 2025 v4.0 (UNVERIFIED)', 'OTHER ROM...']))
  fireEvent.change(game(), { target: { value: 'hack-TSB 2025 v4.0' } })
  fireEvent.click(screen.getByRole('button', { name: 'PLAY' }))
  expect(onLaunch).toHaveBeenCalledWith({ bytes: HACK, rom: unverified('TSB 2025 v4.0'), pkg: TSB }, 'play')
})

test('OTHER ROM takes any file a package scan accepts, titled by its file name', async () => {
  show()
  await screen.findByRole('button', { name: 'PLAY' })
  fireEvent.change(game(), { target: { value: 'other' } })
  fireEvent.click(screen.getByRole('button', { name: 'UPLOAD ROM' }))
  upload(HACK, 'Tecmo2027_rev0.nes')
  fireEvent.click(await screen.findByRole('button', { name: 'PLAY' }))
  expect(game().value).toBe('hack-Tecmo2027_rev0')
  expect(romStore.save).toHaveBeenCalledWith(expect.any(Uint8Array), 'hack-Tecmo2027_rev0', 'Tecmo2027_rev0')
  expect([...game().options].map((o) => o.textContent)).toContain('Tecmo2027_rev0 (UNVERIFIED)')
})

test('OTHER ROM takes a known ROM too and selects that game', async () => {
  vi.mocked(romStore.loadAll).mockResolvedValue([])
  show()
  fireEvent.change(game(), { target: { value: 'other' } })
  fireEvent.click(await screen.findByRole('button', { name: 'UPLOAD ROM' }))
  upload(new Uint8Array([2]), 'whatever.nes')
  await screen.findByRole('button', { name: 'PLAY' })
  expect(game().value).toBe(OLDER.sha1)
})

test('OTHER ROM says why a file failed the scan', async () => {
  show()
  fireEvent.change(game(), { target: { value: 'other' } })
  fireEvent.click(await screen.findByRole('button', { name: 'UPLOAD ROM' }))
  upload(new Uint8Array([4]), 'odd.nes')
  expect(await screen.findByRole('alert')).toHaveTextContent("That file isn't a compatible ROM: its roster is odd.")
})

test('the last unverified ROM is picked again next time', async () => {
  vi.mocked(romStore.loadAll).mockResolvedValue([{ bytes: HACK, title: 'My Hack' }])
  const first = show()
  await waitFor(() => expect(game().options.length).toBe(4))
  fireEvent.change(game(), { target: { value: 'hack-My Hack' } })
  fireEvent.click(screen.getByRole('button', { name: 'PLAY' }))
  expect(first.onLaunch).toHaveBeenCalled()
  cleanup()
  show()
  await waitFor(() => expect(game().value).toBe('hack-My Hack'))
  expect(screen.getByRole('button', { name: 'PLAY' })).toBeInTheDocument()
})
