import { profileFor, TSB2026, type RomProfile } from './profiles'

export const TARGET_ROM_SHA1 = TSB2026.sha1

export type RomValidation = { ok: true; profile: RomProfile } | { ok: false; reason: 'not-nes' | 'wrong-rom' }

const MAGIC = [0x4e, 0x45, 0x53, 0x1a]

export async function validateRom(bytes: Uint8Array): Promise<RomValidation> {
  if (bytes.length < 4 || MAGIC.some((value, index) => bytes[index] !== value)) return { ok: false, reason: 'not-nes' }
  const digest = await crypto.subtle.digest('SHA-1', bytes as BufferSource)
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const profile = profileFor(hex)
  return profile ? { ok: true, profile } : { ok: false, reason: 'wrong-rom' }
}
