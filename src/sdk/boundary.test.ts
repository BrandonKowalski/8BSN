import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const PACKAGES = join(ROOT, 'packages')
const SRC = join(ROOT, 'src')
const HEADLESS = join(ROOT, 'tools', 'headless')
const SPEC = /(?<![\w$.])(?:from|import\s*\(|import)\s*['"]([^'"\n]+)['"]/g

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

function specsIn(source: string): string[] {
  return [...source.matchAll(SPEC)].map((m) => m[1])
}

function specs(file: string): string[] {
  return specsIn(readFileSync(file, 'utf8'))
}

function packageOf(file: string): string {
  return relative(PACKAGES, file).split(sep)[0]
}

function violation(file: string, spec: string): string | null {
  const isTest = /\.test\.[^/]+$/.test(file)
  const isNodeTest = file.endsWith('.node.test.ts')
  const inTools = relative(PACKAGES, file).split(sep).includes('tools')
  if (spec.startsWith('.')) {
    const target = resolve(dirname(file), spec)
    if (target === HEADLESS) return inTools || isNodeTest ? null : 'headless is for tooling only'
    return relative(join(PACKAGES, packageOf(file)), target).startsWith('..') ? 'escapes its package' : null
  }
  if (spec === 'react' || spec === 'react/jsx-runtime' || spec === '@8bsn/sdk') return null
  if (spec === '@8bsn/sdk/core') return file.endsWith('.worker.ts') ? null : 'core is for workers only'
  if (spec === '@8bsn/sdk/testing' || spec === 'vitest' || spec.startsWith('@testing-library/') || spec.startsWith('fake-indexeddb')) {
    return isTest ? null : 'test-only import'
  }
  if (spec.startsWith('node:') || spec === 'pngjs' || spec === 'vite') {
    return inTools || isNodeTest ? null : 'tooling-only import'
  }
  return 'not allowed'
}

describe('import parser', () => {
  it('finds two imports on one line', () => {
    expect(specsIn("import a from './a'; import { b } from './b'")).toEqual(['./a', './b'])
  })

  it('finds a side-effect import', () => {
    expect(specsIn("import './style.css'\nimport 'fake-indexeddb/auto'; import './more.css'")).toEqual(['./style.css', 'fake-indexeddb/auto', './more.css'])
  })

  it('finds a dynamic import', () => {
    expect(specsIn("const m = await import('./lazy'); const n = await import(\n  '../other'\n)")).toEqual(['./lazy', '../other'])
  })

  it('finds export from', () => {
    expect(specsIn("export * from './all'; export { x } from \"./x\"\nexport type { Y } from './y'")).toEqual(['./all', './x', './y'])
  })

  it('finds a multi-line import', () => {
    expect(specsIn("import {\n  a,\n  b,\n} from './ab'")).toEqual(['./ab'])
  })
})

describe('package boundary', () => {
  it('package files import only the sdk, react and their own folder', () => {
    const found = walk(PACKAGES).flatMap((file) =>
      specs(file).flatMap((spec) => {
        const reason = violation(file, spec)
        return reason ? [`${relative(ROOT, file)}: ${spec} (${reason})`] : []
      }),
    )
    expect(found).toEqual([])
  })

  it('network files never import package code', () => {
    const allowed = new Set([join(SRC, 'packages', 'registry.ts'), join(SRC, 'sdk', 'testing.tsx')])
    const found = walk(SRC)
      .filter((file) => !allowed.has(file))
      .flatMap((file) =>
        specs(file)
          .filter((spec) => spec.startsWith('.'))
          .filter((spec) => {
            const target = resolve(dirname(file), spec)
            return target === PACKAGES || target.startsWith(PACKAGES + sep)
          })
          .map((spec) => `${relative(ROOT, file)}: ${spec}`),
      )
    expect(found).toEqual([])
  })
})
