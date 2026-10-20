import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SRC = join(ROOT, 'src')
const SKIP = [join(SRC, 'packages', 'registry.ts'), join(SRC, 'emu', 'core')]
const WORDS = ['touchdowns?', 'quarters?', 'yards?', 'possession', 'helmets?', 'football', 'nfl', 'nflpa', 'tecmo', 'tsb', 'kickoff', 'punts?', 'downs']
const capital = (word: string) => word[0].toUpperCase() + word.slice(1)
const FOOTBALL = new RegExp(
  WORDS.flatMap((word) => [`(?<![A-Za-z])${word}(?![a-z])`, `(?<![A-Z])${capital(word)}(?![a-z])`, `(?<![A-Z])${word.toUpperCase()}(?![a-z])`]).join('|'),
)

const ALLOWED: { file: string; text: string; reason: string }[] = [
  { file: 'src/rom/romStore.ts', text: "'tecmo-broadcast'", reason: "IndexedDB name holding viewers' ROMs" },
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

  it('catches football words at camelCase boundaries', () => {
    for (const hit of ['kickoffLabel', 'isTouchdown', 'possessionTeam', 'TsbView', 'NFL_TEAMS', 'drawHelmets', 'quarter1', 'Tecmo Bowl', 'tsb']) expect(FOOTBALL.test(hit)).toBe(true)
    for (const miss of ['downstream', 'yardstick', 'breakdowns', 'countdown', 'quarterly', 'helmeted', 'networks']) expect(FOOTBALL.test(miss)).toBe(false)
  })
})
