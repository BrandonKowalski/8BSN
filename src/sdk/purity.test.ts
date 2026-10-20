import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SRC = join(ROOT, 'src')
const SKIP = [join(SRC, 'packages', 'registry.ts'), join(SRC, 'emu', 'core')]
const FOOTBALL = /\b(touchdowns?|quarters?|yards?|possession|helmets?|football|nfl|nflpa|tecmo|tsb|kickoff|punts?|downs)\b/i

const ALLOWED: { file: string; text: string; reason: string }[] = [
  { file: 'src/rom/romStore.ts', text: "'tecmo-broadcast'", reason: 'IndexedDB name holding viewers ROMs' },
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (SKIP.some((skip) => path === skip)) return []
    if (statSync(path).isDirectory()) return walk(path)
    if (!/\.(tsx?|css)$/.test(name) || /\.test\.[^/]+$/.test(name)) return []
    return [path]
  })
}

function allowed(file: string, line: string): boolean {
  return ALLOWED.some((a) => a.file === file && line.includes(a.text) && !FOOTBALL.test(line.replace(a.text, '')))
}

describe('network purity', () => {
  it('network files carry no football or TSB terms', () => {
    const found = walk(SRC).flatMap((path) => {
      const file = relative(ROOT, path)
      return readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (FOOTBALL.test(line) && !allowed(file, line) ? [`${file}:${i + 1}: ${line.trim()}`] : []))
    })
    expect(found).toEqual([])
  })
})
