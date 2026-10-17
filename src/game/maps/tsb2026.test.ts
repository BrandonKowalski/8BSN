import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { TARGET_ROM_SHA1 } from '../../rom/validateRom'
import type { Addr } from '../memoryMap'
import { TSB2026_MAP } from './tsb2026'

const SIZES = { ram: 2048, sram: 8192 }

function collectAddrs(value: unknown, out: Addr[] = []): Addr[] {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ((record.region === 'ram' || record.region === 'sram') && typeof record.offset === 'number') out.push(record as Addr)
    else for (const child of Object.values(record)) collectAddrs(child, out)
  }
  return out
}

test('every address in the map lies inside its region', () => {
  const addrs = collectAddrs(TSB2026_MAP)
  expect(addrs.length).toBeGreaterThan(15)
  for (const addr of addrs) {
    expect(addr.offset).toBeGreaterThanOrEqual(0)
    expect(addr.offset).toBeLessThan(SIZES[addr.region])
  }
})

test('the map is tied to the target ROM', () => {
  expect(TSB2026_MAP.romSha1).toBe(TARGET_ROM_SHA1)
})

type Expect = {
  inGame: boolean
  quarter?: number
  down?: number
  scores?: [number, number]
  offense?: 0 | 1
  clock?: string
  live?: boolean
}

type Stat = { sram: number; value: number; player: string; stat: string }

const fixtureDir = 'tests/fixtures/tsb2026'
const manifestPath = join(fixtureDir, 'manifest.json')

test.skipIf(!existsSync(manifestPath))('raw map reads agree with every fixture in the manifest', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name: string; expect: Expect; stats?: Stat[] }[]
  const map = TSB2026_MAP
  for (const { name, expect: want, stats } of manifest) {
    const ram = readFileSync(join(fixtureDir, `${name}.ram`))
    const sram = readFileSync(join(fixtureDir, `${name}.sram`))
    const at = (a: Addr) => ram[a.offset]
    expect(map.inGameValues.includes(at(map.gameStatus)), name).toBe(want.inGame)
    if (want.quarter !== undefined) expect(at(map.quarter) + 1, name).toBe(want.quarter)
    if (want.down !== undefined) expect(at(map.down) + 1, name).toBe(want.down)
    if (want.scores) expect([at(map.scores[0]), at(map.scores[1])], name).toEqual(want.scores)
    if (want.offense !== undefined) expect(at(map.offense) & map.offenseP2Mask ? 1 : 0, name).toBe(want.offense)
    if (want.live !== undefined) {
      const status = at(map.playStatus)
      const live = (status & map.bits.snapped) !== 0 && (status & (map.bits.over | map.bits.touchdown)) === 0
      expect(live, name).toBe(want.live)
    }
    for (const stat of stats ?? []) expect(sram[stat.sram], `${name} ${stat.player} ${stat.stat}`).toBe(stat.value)
    if (want.clock) expect(`${at(map.clockMinutes).toString(16)}:${at(map.clockSeconds).toString(16).padStart(2, '0')}`, name).toBe(want.clock)
  }
})
