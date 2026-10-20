import { cleanup, render, renderHook, screen, within } from '@testing-library/react'
import { createElement } from 'react'
import { webcrypto } from 'node:crypto'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import InfoModal from '../InfoModal'
import { validateRom } from '../rom/validateRom'
import type { BroadcastPackage } from '../sdk/types'
import { EMPTY_PACKAGE } from './empty'
import { IDLE_PACKAGE, idlePackage, PACKAGES, packageFor, romsOf } from './registry'

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
})

afterEach(cleanup)

const TSB_2026 = '25ab46078b26380cab04bac01bf9b1c5a2efa432'
const TSB_1991 = '0f0284970cffc719c9993a9303e72077c0f8513a'

const fake = (id: string, sha1: string, owners: string[]): BroadcastPackage => ({
  id,
  name: id,
  contract: 1,
  version: '0.0.0',
  roms: [{ sha1, title: id, about: '' }],
  owners,
  useSession: () => {
    throw new Error('unused')
  },
  slots: {},
})

test('packageFor finds TSB for both hashes', () => {
  for (const sha1 of [TSB_2026, TSB_1991]) {
    const found = packageFor(sha1)
    expect(found?.pkg.id).toBe('tsb')
    expect(found?.rom.sha1).toBe(sha1)
  }
  expect(packageFor('nope')).toBeNull()
})

test('romsOf lists every rom with its package in registry order', () => {
  const other = fake('other', 'abc', [])
  expect(romsOf([...PACKAGES, other]).map(({ rom, pkg }) => [rom.title, pkg.id])).toEqual([
    ['Tecmo Super Bowl 2026', 'tsb'],
    ['Tecmo Super Bowl', 'tsb'],
    ['other', 'other'],
  ])
})

test('validateRom refuses a hash no package claims', async () => {
  const bytes = new Uint8Array(64)
  bytes.set([0x4e, 0x45, 0x53, 0x1a])
  expect(await validateRom(bytes, [])).toEqual({ ok: false, reason: 'wrong-rom' })
  const digest = await crypto.subtle.digest('SHA-1', bytes as BufferSource)
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const other = fake('other', hex, [])
  expect(await validateRom(bytes, [other])).toEqual({ ok: true, rom: other.roms[0], pkg: other })
})

test('the info note joins owners as before', () => {
  render(createElement(InfoModal, { onClose: vi.fn(), active: null }))
  expect(screen.getByText(/not affiliated/).textContent).toBe('8BSN is not affiliated with Tecmo, the NFL or the NFLPA.')
})

const credits = () =>
  within(screen.getByRole('dialog'))
    .getAllByRole('definition')
    .map((dd) => [dd.previousElementSibling?.textContent, dd.textContent])

const OLD_CREDITS = [
  ['Emulation', 'Mesen by Sour, GPL-3.0, compiled to WebAssembly'],
  ['Game', 'Tecmo Super Bowl by Tecmo, 1991'],
  ['ROM Hacking', 'Knobbe, bruddog, SBlueman and the other legends on tecmobowl.org'],
  ['Font', 'Press Start 2P by CodeMan38, SIL Open Font License'],
  ['Scores', 'ESPN Public Scoreboard'],
  ['BUILT BY', 'Brandon T. Kowalski'],
]

test('the info credits keep their old order with TSB active', () => {
  render(createElement(InfoModal, { onClose: vi.fn(), active: PACKAGES[0] }))
  expect(credits()).toEqual(OLD_CREDITS)
  cleanup()
  render(createElement(InfoModal, { onClose: vi.fn(), active: null }))
  expect(credits()).toEqual(OLD_CREDITS)
})

test('the info modal lists every supported rom', () => {
  render(createElement(InfoModal, { onClose: vi.fn(), active: null }))
  expect(screen.getByText(`SHA-1 ${TSB_2026}`)).toBeInTheDocument()
  expect(screen.getByText(`SHA-1 ${TSB_1991}`)).toBeInTheDocument()
})

test('every bundled package has a release version', () => {
  for (const pkg of PACKAGES) expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
})

test('the info modal names each package with its version', () => {
  render(createElement(InfoModal, { onClose: vi.fn(), active: null }))
  expect(screen.getByText('Tecmo Super Bowl package 1.0.0')).toBeInTheDocument()
})

test('the empty package has no roms and an idle session', () => {
  expect(EMPTY_PACKAGE.id).toBe('none')
  expect(EMPTY_PACKAGE.roms).toEqual([])
  const { result } = renderHook(() => EMPTY_PACKAGE.useSession({ emulator: null, rom: null, forceWindow: false, tailgate: false, league: { games: null, records: null, toRom: (abbr) => abbr }, action: null }))
  expect(result.current).toMatchObject({ data: null, phase: 'menus', generation: 0 })
  expect(result.current.save()).toBeNull()
})

test('with no ROM loaded the idle package carries the league of the sole bundled package', () => {
  expect(IDLE_PACKAGE.id).toBe(EMPTY_PACKAGE.id)
  expect(IDLE_PACKAGE.roms).toEqual([])
  expect(IDLE_PACKAGE.league).toBe(PACKAGES[0].league)
  const league = { path: 'x/y' }
  expect(idlePackage([{ ...fake('a', 'aa', []), league }]).league).toBe(league)
  expect(idlePackage([{ ...fake('a', 'aa', []), league }, { ...fake('b', 'bb', []), league }]).league).toBeUndefined()
})
