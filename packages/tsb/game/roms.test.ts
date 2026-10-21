import { expect, test } from 'vitest'
import { TSB1991, TSB2026, tsbRom } from './roms'

test('known ROMs keep their own settings', () => {
  expect(tsbRom(TSB2026.sha1)).toBe(TSB2026)
  expect(tsbRom(TSB1991.sha1)).toBe(TSB1991)
})

test('a scanned ROM uses the 2026 settings under its own hash', () => {
  const rom = tsbRom('feed')
  expect(rom.sha1).toBe('feed')
  expect(rom.roster).toBe(TSB2026.roster)
  expect(rom.selectGrid).toBe(TSB2026.selectGrid)
  expect(rom.helmets).toBe(TSB2026.helmets)
})
