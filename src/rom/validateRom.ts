export const TARGET_ROM_SHA1 = '25ab46078b26380cab04bac01bf9b1c5a2efa432'

export type RomValidation = { ok: true } | { ok: false; reason: 'not-nes' | 'wrong-rom' }

const MAGIC = [0x4e, 0x45, 0x53, 0x1a]

export async function validateRom(bytes: Uint8Array): Promise<RomValidation> {
  if (bytes.length < 4 || MAGIC.some((value, index) => bytes[index] !== value)) return { ok: false, reason: 'not-nes' }
  const digest = await crypto.subtle.digest('SHA-1', bytes as BufferSource)
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return hex === TARGET_ROM_SHA1 ? { ok: true } : { ok: false, reason: 'wrong-rom' }
}
