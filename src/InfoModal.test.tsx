import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import InfoModal from './InfoModal'
import { PACKAGES } from './packages/registry'
import { romStore } from './rom/romStore'
import { validateRom } from './rom/validateRom'

vi.mock('./rom/validateRom', () => ({ validateRom: vi.fn() }))
vi.mock('./rom/romStore', () => ({ romStore: { load: vi.fn(), loadAll: vi.fn(), save: vi.fn(), select: vi.fn(), remove: vi.fn(), clear: vi.fn() } }))

const TSB = PACKAGES[0]
const [NEWER, OLDER] = TSB.roms

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(romStore.loadAll).mockResolvedValue([new Uint8Array([1])])
  vi.mocked(romStore.remove).mockResolvedValue()
  vi.mocked(validateRom).mockResolvedValue({ ok: true, rom: NEWER, pkg: TSB })
})

afterEach(cleanup)

const row = (title: string) => screen.getAllByTestId('info-rom').find((li) => within(li).queryByText(title, { selector: '.info-rom-title' }))!

test('each supported ROM says whether it is stored', async () => {
  render(<InfoModal onClose={vi.fn()} active={null} />)
  expect(await within(row(NEWER.title)).findByText('STORED')).toBeInTheDocument()
  expect(within(row(OLDER.title)).getByText('NOT STORED')).toBeInTheDocument()
  expect(within(row(OLDER.title)).queryByRole('button', { name: 'REMOVE' })).toBeNull()
})

test('removing a stored ROM asks first, then forgets it', async () => {
  render(<InfoModal onClose={vi.fn()} active={null} />)
  fireEvent.click(await within(row(NEWER.title)).findByRole('button', { name: 'REMOVE' }))
  expect(romStore.remove).not.toHaveBeenCalled()
  vi.mocked(romStore.loadAll).mockResolvedValue([])
  fireEvent.click(within(row(NEWER.title)).getByRole('button', { name: 'YES' }))
  expect(romStore.remove).toHaveBeenCalledWith(NEWER.sha1)
  expect(await within(row(NEWER.title)).findByText('NOT STORED')).toBeInTheDocument()
})

test('NO keeps the ROM', async () => {
  render(<InfoModal onClose={vi.fn()} active={null} />)
  fireEvent.click(await within(row(NEWER.title)).findByRole('button', { name: 'REMOVE' }))
  fireEvent.click(within(row(NEWER.title)).getByRole('button', { name: 'NO' }))
  expect(romStore.remove).not.toHaveBeenCalled()
  expect(within(row(NEWER.title)).getByText('STORED')).toBeInTheDocument()
})
