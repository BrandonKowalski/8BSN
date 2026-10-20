import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const PACKAGES = join(ROOT, 'packages')
const SRC = join(ROOT, 'src')
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

function specs(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(SPEC)].map((m) => m[1])
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
    return relative(join(PACKAGES, packageOf(file)), target).startsWith('..') ? 'escapes its package' : null
  }
  if (spec === 'react' || spec === 'react/jsx-runtime' || spec === '@8bsn/sdk') return null
  if (spec === '@8bsn/sdk/core') return file.endsWith('.worker.ts') ? null : 'core is for workers only'
  if (spec === '@8bsn/sdk/testing' || spec === 'vitest' || spec.startsWith('@testing-library/')) {
    return isTest ? null : 'test-only import'
  }
  if (spec.startsWith('node:') || spec === 'pngjs' || spec === 'vite') {
    return inTools || isNodeTest ? null : 'tooling-only import'
  }
  return 'not allowed'
}

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
