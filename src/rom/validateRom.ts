import { packageFor, PACKAGES } from '../packages/registry'
import type { BroadcastPackage, RomInfo } from '../sdk/types'

export type RomValidation = { ok: true; rom: RomInfo; pkg: BroadcastPackage } | { ok: false; reason: 'not-nes' | 'wrong-rom' }

const MAGIC = [0x4e, 0x45, 0x53, 0x1a]

export async function validateRom(bytes: Uint8Array, packages: readonly BroadcastPackage[] = PACKAGES): Promise<RomValidation> {
  if (bytes.length < 4 || MAGIC.some((value, index) => bytes[index] !== value)) return { ok: false, reason: 'not-nes' }
  const digest = await crypto.subtle.digest('SHA-1', bytes as BufferSource)
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const found = packageFor(hex, packages)
  return found ? { ok: true, ...found } : { ok: false, reason: 'wrong-rom' }
}
