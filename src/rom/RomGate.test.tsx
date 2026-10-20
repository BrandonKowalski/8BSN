import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PACKAGES, romsOf } from '../packages/registry'
import RomGate from './RomGate'
import { romStore } from './romStore'
import { validateRom } from './validateRom'

vi.mock('./validateRom', () => ({ validateRom: vi.fn() }))
vi.mock('./romStore', () => ({ romStore: { load: vi.fn(), loadAll: vi.fn(), save: vi.fn(), select: vi.fn(), remove: vi.fn(), clear: vi.fn() } }))

const TSB = PACKAGES[0]
const [TSB2026, TSB1991] = TSB.roms

const file = (bytes: number[]) => new File([new Uint8Array(bytes)], 'x.nes')

afterEach(cleanup)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(romStore.load).mockResolvedValue(null)
  vi.mocked(romStore.clear).mockResolvedValue()
  vi.mocked(romStore.loadAll).mockResolvedValue([])
})

const getStarted = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'GET STARTED' }))
  return screen.findByRole('dialog', { name: 'GAME SELECTOR' })
}

const uploadInto = (dialog: HTMLElement, title: string, bytes: number[]) => {
  fireEvent.click(within(dialog).getByRole('button', { name: `Upload ${title}` }))
  fireEvent.change(within(dialog).getByLabelText(/rom file/i), { target: { files: [file(bytes)] } })
}

test('with no ROM there is only GET STARTED, and it opens the game selector', async () => {
  render(<RomGate onReady={vi.fn()} primaryLabel="START GAME" onStart={vi.fn()} />)
  const button = await screen.findByRole('button', { name: 'GET STARTED' })
  expect(button).toHaveFocus()
  expect(screen.queryByRole('button', { name: 'SWITCH GAME' })).toBeNull()
  const dialog = await getStarted()
  expect(within(dialog).getAllByTestId('rom-status').map((s) => s.textContent)).toEqual(['NOT LOADED', 'NOT LOADED'])
})

test('shows the storage note and still calls onReady when save fails', async () => {
  vi.mocked(validateRom).mockResolvedValue({ ok: true, rom: TSB2026, pkg: TSB })
  vi.mocked(romStore.save).mockResolvedValue(false)
  const onReady = vi.fn()
  render(<RomGate onReady={onReady} primaryLabel="START GAME" onStart={vi.fn()} />)
  uploadInto(await getStarted(), TSB2026.title, [1, 2, 3])
  expect(await screen.findByText("This browser won't remember the ROM, so you'll pick it again next time.")).toBeInTheDocument()
  expect(onReady).toHaveBeenCalledTimes(1)
  expect(Array.from(onReady.mock.calls[0][0].bytes as Uint8Array)).toEqual([1, 2, 3])
  expect(onReady.mock.calls[0][0].rom).toBe(TSB2026)
})

test('shows the wrong ROM copy and does not call onReady', async () => {
  vi.mocked(validateRom).mockResolvedValue({ ok: false, reason: 'wrong-rom' })
  const onReady = vi.fn()
  render(<RomGate onReady={onReady} primaryLabel="START GAME" onStart={vi.fn()} />)
  uploadInto(await getStarted(), TSB2026.title, [1])
  expect(await screen.findByText(`That file isn't ${TSB2026.title}.`)).toBeInTheDocument()
  expect(onReady).not.toHaveBeenCalled()
  expect(romStore.save).not.toHaveBeenCalled()
})

test('shows the not-NES copy', async () => {
  vi.mocked(validateRom).mockResolvedValue({ ok: false, reason: 'not-nes' })
  render(<RomGate onReady={vi.fn()} primaryLabel="START GAME" onStart={vi.fn()} />)
  uploadInto(await getStarted(), TSB2026.title, [1])
  expect(await screen.findByText("That doesn't look like an NES ROM.")).toBeInTheDocument()
})

test('uses a stored ROM and offers the game selector instead of change and remove', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([9, 9]))
  vi.mocked(validateRom).mockResolvedValue({ ok: true, rom: TSB2026, pkg: TSB })
  const onReady = vi.fn()
  render(<RomGate onReady={onReady} primaryLabel="START GAME" onStart={vi.fn()} />)
  await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
  expect(Array.from(onReady.mock.calls[0][0].bytes as Uint8Array)).toEqual([9, 9])
  expect(screen.getByRole('button', { name: 'SWITCH GAME' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'REMOVE ROM' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'CHANGE ROM' })).toBeNull()
})

test('the game selector lists every supported game, which are stored, and says ROMs stay local', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([9, 9]))
  vi.mocked(romStore.loadAll).mockResolvedValue([new Uint8Array([9, 9])])
  vi.mocked(validateRom).mockResolvedValue({ ok: true, rom: TSB2026, pkg: TSB })
  render(<RomGate onReady={vi.fn()} primaryLabel="START GAME" onStart={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'SWITCH GAME' }))
  const dialog = await screen.findByRole('dialog', { name: 'GAME SELECTOR' })
  const rows = within(dialog).getAllByTestId('rom-row')
  expect(rows).toHaveLength(romsOf(PACKAGES).length)
  expect(within(rows[0]).getByText(TSB2026.title)).toBeInTheDocument()
  expect(within(rows[0]).getByTestId('rom-status')).toHaveTextContent('ACTIVE')
  expect(within(rows[1]).getByText(TSB1991.title)).toBeInTheDocument()
  expect(within(rows[1]).getByTestId('rom-status')).toHaveTextContent('NOT LOADED')
  expect(within(rows[1]).queryByRole('button', { name: 'USE' })).toBeNull()
  expect(within(dialog).getByRole('button', { name: `Upload ${TSB1991.title}` })).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: `Clear ${TSB2026.title}` })).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: `Upload ${TSB2026.title}` })).toBeNull()
  expect(dialog).toHaveTextContent('ROMs are stored locally in this browser')
})

test('uploading in the game selector stores that game and switches to it', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([9, 9]))
  vi.mocked(romStore.save).mockResolvedValue(true)
  vi.mocked(validateRom).mockImplementation(async (bytes) => ({ ok: true, rom: bytes[0] === 9 ? TSB2026 : TSB1991, pkg: TSB }))
  const onReady = vi.fn()
  render(<RomGate onReady={onReady} primaryLabel="START GAME" onStart={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'SWITCH GAME' }))
  const dialog = await screen.findByRole('dialog', { name: 'GAME SELECTOR' })
  fireEvent.change(within(dialog).getByLabelText(/rom file/i), { target: { files: [file([4])] } })
  expect(romStore.save).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: `Upload ${TSB1991.title}` }))
  fireEvent.change(within(dialog).getByLabelText(/rom file/i), { target: { files: [file([4])] } })
  await waitFor(() => expect(romStore.save).toHaveBeenCalledWith(new Uint8Array([4]), TSB1991.sha1))
  expect(onReady).toHaveBeenLastCalledWith({ bytes: new Uint8Array([4]), rom: TSB1991, pkg: TSB })
})

test('the game selector says when an upload is the other game', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([9, 9]))
  vi.mocked(validateRom).mockResolvedValue({ ok: true, rom: TSB2026, pkg: TSB })
  render(<RomGate onReady={vi.fn()} primaryLabel="START GAME" onStart={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'SWITCH GAME' }))
  const dialog = await screen.findByRole('dialog', { name: 'GAME SELECTOR' })
  fireEvent.click(within(dialog).getByRole('button', { name: `Upload ${TSB1991.title}` }))
  fireEvent.change(within(dialog).getByLabelText(/rom file/i), { target: { files: [file([4])] } })
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(`That file is ${TSB2026.title}, not ${TSB1991.title}.`)
  expect(romStore.save).not.toHaveBeenCalled()
})

test('USE switches to another stored game', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([9, 9]))
  vi.mocked(romStore.loadAll).mockResolvedValue([new Uint8Array([9, 9]), new Uint8Array([4])])
  vi.mocked(validateRom).mockImplementation(async (bytes) => ({ ok: true, rom: bytes[0] === 9 ? TSB2026 : TSB1991, pkg: TSB }))
  const onReady = vi.fn()
  render(<RomGate onReady={onReady} primaryLabel="START GAME" onStart={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'SWITCH GAME' }))
  const dialog = await screen.findByRole('dialog', { name: 'GAME SELECTOR' })
  fireEvent.click(await within(dialog).findByRole('button', { name: 'USE' }))
  await waitFor(() => expect(romStore.select).toHaveBeenCalledWith(TSB1991.sha1))
  expect(onReady).toHaveBeenLastCalledWith({ bytes: new Uint8Array([4]), rom: TSB1991, pkg: TSB })
  await waitFor(() => expect(within(dialog).getAllByTestId('rom-status')[1]).toHaveTextContent('ACTIVE'))
})

test('saves only the uploaded ROM bytes under its game', async () => {
  vi.mocked(validateRom).mockResolvedValue({ ok: true, rom: TSB2026, pkg: TSB })
  vi.mocked(romStore.save).mockResolvedValue(true)
  render(<RomGate onReady={vi.fn()} primaryLabel="START GAME" onStart={vi.fn()} />)
  uploadInto(await getStarted(), TSB2026.title, [1])
  await waitFor(() => expect(romStore.save).toHaveBeenCalled())
  expect(vi.mocked(romStore.save).mock.calls[0]).toEqual([new Uint8Array([1]), TSB2026.sha1])
  expect(await screen.findByRole('button', { name: 'START GAME' })).toBeInTheDocument()
})

test('CLEAR on the active game switches to another stored game, then back to GET STARTED', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([9, 9]))
  vi.mocked(romStore.loadAll).mockResolvedValue([new Uint8Array([9, 9]), new Uint8Array([4])])
  vi.mocked(validateRom).mockImplementation(async (bytes) => ({ ok: true, rom: bytes[0] === 9 ? TSB2026 : TSB1991, pkg: TSB }))
  const onReady = vi.fn()
  const onClear = vi.fn()
  render(<RomGate onReady={onReady} onClear={onClear} primaryLabel="START GAME" onStart={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'SWITCH GAME' }))
  const dialog = await screen.findByRole('dialog', { name: 'GAME SELECTOR' })
  fireEvent.click(await within(dialog).findByRole('button', { name: `Clear ${TSB2026.title}` }))
  await waitFor(() => expect(romStore.remove).toHaveBeenCalledWith(TSB2026.sha1))
  await waitFor(() => expect(onReady).toHaveBeenLastCalledWith({ bytes: new Uint8Array([4]), rom: TSB1991, pkg: TSB }))
  expect(within(dialog).getByRole('button', { name: `Upload ${TSB2026.title}` })).toBeInTheDocument()
  expect(onClear).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: `Clear ${TSB1991.title}` }))
  await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1))
  expect(within(dialog).getAllByTestId('rom-status').map((s) => s.textContent)).toEqual(['NOT LOADED', 'NOT LOADED'])
  fireEvent.click(within(dialog).getByRole('button', { name: 'CLOSE' }))
  expect(await screen.findByRole('button', { name: 'GET STARTED' })).toBeInTheDocument()
})
