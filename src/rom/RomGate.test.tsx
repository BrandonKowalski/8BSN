import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import RomGate from './RomGate'
import { romStore } from './romStore'
import { validateRom } from './validateRom'

vi.mock('./validateRom', () => ({ validateRom: vi.fn() }))
vi.mock('./romStore', () => ({ romStore: { load: vi.fn(), save: vi.fn(), clear: vi.fn() } }))

const file = (bytes: number[]) => new File([new Uint8Array(bytes)], 'x.nes')

afterEach(cleanup)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(romStore.load).mockResolvedValue(null)
  vi.mocked(romStore.clear).mockResolvedValue()
})

const pick = (bytes: number[]) => fireEvent.change(screen.getByLabelText(/rom file/i), { target: { files: [file(bytes)] } })

test('shows the storage note and still calls onReady when save fails', async () => {
  vi.mocked(validateRom).mockResolvedValue({ ok: true })
  vi.mocked(romStore.save).mockResolvedValue(false)
  const onReady = vi.fn()
  render(<RomGate onReady={onReady} primaryLabel="START GAME" onStart={vi.fn()} />)
  await screen.findByLabelText(/rom file/i)
  pick([1, 2, 3])
  expect(await screen.findByText("This browser won't remember the ROM, so you'll pick it again next time.")).toBeInTheDocument()
  expect(onReady).toHaveBeenCalledTimes(1)
  expect(Array.from(onReady.mock.calls[0][0] as Uint8Array)).toEqual([1, 2, 3])
})

test('shows the wrong ROM copy and does not call onReady', async () => {
  vi.mocked(validateRom).mockResolvedValue({ ok: false, reason: 'wrong-rom' })
  const onReady = vi.fn()
  render(<RomGate onReady={onReady} primaryLabel="START GAME" onStart={vi.fn()} />)
  await screen.findByLabelText(/rom file/i)
  pick([1])
  expect(await screen.findByText("That file isn't Tecmo Super Bowl 2026. Pick the roster hack ROM.")).toBeInTheDocument()
  expect(onReady).not.toHaveBeenCalled()
  expect(romStore.save).not.toHaveBeenCalled()
})

test('shows the not-NES copy', async () => {
  vi.mocked(validateRom).mockResolvedValue({ ok: false, reason: 'not-nes' })
  render(<RomGate onReady={vi.fn()} primaryLabel="START GAME" onStart={vi.fn()} />)
  await screen.findByLabelText(/rom file/i)
  pick([1])
  expect(await screen.findByText("That doesn't look like an NES ROM.")).toBeInTheDocument()
})

test('uses a stored ROM, offers change and remove, and remove returns to the picker', async () => {
  vi.mocked(romStore.load).mockResolvedValue(new Uint8Array([9, 9]))
  const onReady = vi.fn()
  render(<RomGate onReady={onReady} primaryLabel="START GAME" onStart={vi.fn()} />)
  await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
  expect(Array.from(onReady.mock.calls[0][0] as Uint8Array)).toEqual([9, 9])
  expect(screen.getByRole('button', { name: 'CHANGE ROM' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'REMOVE ROM' }))
  expect(await screen.findByLabelText(/rom file/i)).toBeInTheDocument()
  expect(romStore.clear).toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'REMOVE ROM' })).toBeNull()
})

test('saves only the picked ROM bytes', async () => {
  vi.mocked(validateRom).mockResolvedValue({ ok: true })
  vi.mocked(romStore.save).mockResolvedValue(true)
  render(<RomGate onReady={vi.fn()} primaryLabel="START GAME" onStart={vi.fn()} />)
  await screen.findByLabelText(/rom file/i)
  pick([1])
  await waitFor(() => expect(romStore.save).toHaveBeenCalled())
  expect(vi.mocked(romStore.save).mock.calls[0]).toEqual([new Uint8Array([1])])
})

