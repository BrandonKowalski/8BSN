import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { beforeAll, expect, test } from 'vitest'
import { PACKAGES } from '../packages/registry'
import { validateRom } from './validateRom'

const [TSB2026, TSB1991] = PACKAGES[0].roms

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
})

test('rejects bytes without the iNES magic as not-nes', async () => {
  expect(await validateRom(new Uint8Array([1, 2, 3, 4]))).toEqual({ ok: false, reason: 'not-nes' })
})

test('rejects a valid header with a random body as wrong-rom', async () => {
  const bytes = new Uint8Array(1024)
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7919 + 13) & 0xff
  bytes.set([0x4e, 0x45, 0x53, 0x1a])
  expect(await validateRom(bytes)).toEqual({ ok: false, reason: 'wrong-rom', detail: "it isn't a 32-team Tecmo Super Bowl ROM" })
})

test('accepts the real ROM when present', async () => {
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(readFileSync('Tecmo Super Bowl 2026.nes'))
  } catch {
    return
  }
  expect(await validateRom(bytes)).toEqual({ ok: true, rom: TSB2026, pkg: PACKAGES[0] })
})

test('accepts the original ROM when present', async () => {
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(readFileSync('Tecmo Super Bowl (USA).nes'))
  } catch {
    return
  }
  expect(await validateRom(bytes)).toEqual({ ok: true, rom: TSB1991, pkg: PACKAGES[0] })
})
