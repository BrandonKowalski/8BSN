import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  vi.mocked(romStore.loadAll).mockResolvedValue([{ bytes: new Uint8Array([1]), title: null }])
  vi.mocked(romStore.remove).mockResolvedValue()
  vi.mocked(validateRom).mockImplementation(async (bytes, _packages, title = 'Unknown ROM') =>
    bytes[0] === 3 ? { ok: true, rom: { sha1: 'hack', title, about: 'a hack', unverified: true }, pkg: TSB } : { ok: true, rom: NEWER, pkg: TSB },
  )
})

afterEach(cleanup)

const openTsb = async () => fireEvent.click(await screen.findByRole('button', { name: 'DETAILS' }))

const row = (title: string) => screen.getAllByTestId('info-rom').find((li) => within(li).queryByText(title, { selector: '.info-rom-title' }))!

test('each supported ROM says whether it is stored', async () => {
  render(<InfoModal onClose={vi.fn()} />)
  await openTsb()
  expect(await within(row(NEWER.title)).findByText('STORED')).toBeInTheDocument()
  expect(within(row(OLDER.title)).getByText('NOT STORED')).toBeInTheDocument()
  expect(within(row(OLDER.title)).queryByRole('button', { name: 'REMOVE' })).toBeNull()
})

test('removing a stored ROM asks first, then forgets it', async () => {
  render(<InfoModal onClose={vi.fn()} />)
  await openTsb()
  fireEvent.click(await within(row(NEWER.title)).findByRole('button', { name: 'REMOVE' }))
  expect(romStore.remove).not.toHaveBeenCalled()
  vi.mocked(romStore.loadAll).mockResolvedValue([])
  fireEvent.click(within(row(NEWER.title)).getByRole('button', { name: 'YES' }))
  expect(romStore.remove).toHaveBeenCalledWith(NEWER.sha1)
  expect(await within(row(NEWER.title)).findByText('NOT STORED')).toBeInTheDocument()
})

test('NO keeps the ROM', async () => {
  render(<InfoModal onClose={vi.fn()} />)
  await openTsb()
  fireEvent.click(await within(row(NEWER.title)).findByRole('button', { name: 'REMOVE' }))
  fireEvent.click(within(row(NEWER.title)).getByRole('button', { name: 'NO' }))
  expect(romStore.remove).not.toHaveBeenCalled()
  expect(within(row(NEWER.title)).getByText('STORED')).toBeInTheDocument()
})

const pkgRow = (name: string) => screen.getAllByTestId('info-package').find((li) => li.querySelector('.info-rom-title')?.textContent?.startsWith(name))!

test('package details stay closed until asked for', async () => {
  render(<InfoModal onClose={vi.fn()} />)
  expect(within(pkgRow(TSB.name)).queryByText('8BSN')).toBeNull()
  expect(screen.queryAllByTestId('info-rom')).toEqual([])
  fireEvent.click(within(pkgRow(TSB.name)).getByRole('button', { name: 'DETAILS' }))
  const details = within(pkgRow(TSB.name))
  expect(details.getByText('8BSN')).toBeInTheDocument()
  expect(details.getByText(TSB.version)).toBeInTheDocument()
  for (const rom of TSB.roms) expect(within(row(rom.title)).getByText(rom.title)).toBeInTheDocument()
  fireEvent.click(details.getByRole('button', { name: 'HIDE' }))
  expect(within(pkgRow(TSB.name)).queryByText('8BSN')).toBeNull()
})

test('package details show every entry the package gives, in order', async () => {
  render(<InfoModal onClose={vi.fn()} />)
  fireEvent.click(within(pkgRow(TSB.name)).getByRole('button', { name: 'DETAILS' }))
  const labels = within(pkgRow(TSB.name).querySelector('dl')!).getAllByRole('term').map((dt) => dt.textContent)
  expect(labels).toEqual(['BY', 'VERSION', ...(TSB.about ?? []).map(({ label }) => label)])
  for (const { value } of TSB.about ?? []) expect(within(pkgRow(TSB.name)).getByText(value)).toBeInTheDocument()
})

test('a stored unverified ROM is listed in its package box and can be removed', async () => {
  vi.mocked(romStore.loadAll).mockResolvedValue([{ bytes: new Uint8Array([1]), title: null }, { bytes: new Uint8Array([3]), title: 'My Hack' }])
  render(<InfoModal onClose={vi.fn()} />)
  await openTsb()
  const hack = within(
    await waitFor(() => {
      const found = row('My Hack')
      expect(found).toBeDefined()
      return found
    }),
  )
  expect(hack.getByText('UNVERIFIED')).toBeInTheDocument()
  expect(hack.getByText('a hack')).toBeInTheDocument()
  fireEvent.click(hack.getByRole('button', { name: 'REMOVE' }))
  vi.mocked(romStore.loadAll).mockResolvedValue([{ bytes: new Uint8Array([1]), title: null }])
  fireEvent.click(hack.getByRole('button', { name: 'YES' }))
  expect(romStore.remove).toHaveBeenCalledWith('hack')
  await waitFor(() => expect(screen.queryByText('My Hack')).toBeNull())
})

test('a package with a scan says other ROMs can load', async () => {
  render(<InfoModal onClose={vi.fn()} />)
  await openTsb()
  expect(within(pkgRow(TSB.name)).getByText(TSB.scan!.note)).toBeInTheDocument()
})
