import { packageFor, PACKAGES } from '../packages/registry'
import type { BroadcastPackage, RomInfo } from '../sdk/types'

export type RomValidation =
  | { ok: true; rom: RomInfo; pkg: BroadcastPackage }
  | { ok: false; reason: 'not-nes' }
  | { ok: false; reason: 'wrong-rom'; detail?: string }

const MAGIC = [0x4e, 0x45, 0x53, 0x1a]
const UNTITLED = 'Unknown ROM'

export async function validateRom(bytes: Uint8Array, packages: readonly BroadcastPackage[] = PACKAGES, title = UNTITLED): Promise<RomValidation> {
  if (bytes.length < 4 || MAGIC.some((value, index) => bytes[index] !== value)) return { ok: false, reason: 'not-nes' }
  const digest = await crypto.subtle.digest('SHA-1', bytes as BufferSource)
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const found = packageFor(hex, packages)
  if (found) return { ok: true, ...found }
  let detail: string | undefined
  for (const pkg of packages) {
    if (!pkg.scan) continue
    const scan = pkg.scan.check(bytes)
    if (scan.ok) return { ok: true, rom: { sha1: hex, title, about: pkg.scan.about, unverified: true }, pkg }
    detail ??= scan.reason
  }
  return detail === undefined ? { ok: false, reason: 'wrong-rom' } : { ok: false, reason: 'wrong-rom', detail }
}
