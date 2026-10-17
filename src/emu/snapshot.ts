export const RAM_BYTES = 2048
export const SRAM_BYTES = 8192
const HEADER_BYTES = 16
export const SNAPSHOT_BYTES = HEADER_BYTES + RAM_BYTES + SRAM_BYTES

const SEQ = 0
const FRAME = 1
const MAX_ATTEMPTS = 4

export type Snapshot = { ram: Uint8Array; sram: Uint8Array; frame: number }

export function emptySnapshot(): Snapshot {
  return { ram: new Uint8Array(RAM_BYTES), sram: new Uint8Array(SRAM_BYTES), frame: 0 }
}

export function writeSnapshot(sab: SharedArrayBuffer, ram: Uint8Array, sram: Uint8Array, frame: number): void {
  const header = new Int32Array(sab, 0, 4)
  Atomics.add(header, SEQ, 1)
  new Uint8Array(sab, HEADER_BYTES, RAM_BYTES).set(ram.subarray(0, RAM_BYTES))
  new Uint8Array(sab, HEADER_BYTES + RAM_BYTES, SRAM_BYTES).set(sram.subarray(0, SRAM_BYTES))
  Atomics.store(header, FRAME, frame)
  Atomics.add(header, SEQ, 1)
}

export function readSnapshot(sab: SharedArrayBuffer, into: Snapshot): boolean {
  const header = new Int32Array(sab, 0, 4)
  const ram = new Uint8Array(sab, HEADER_BYTES, RAM_BYTES)
  const sram = new Uint8Array(sab, HEADER_BYTES + RAM_BYTES, SRAM_BYTES)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const before = Atomics.load(header, SEQ)
    if (before & 1) continue
    into.ram.set(ram)
    into.sram.set(sram)
    const frame = Atomics.load(header, FRAME)
    if (Atomics.load(header, SEQ) === before) {
      into.frame = frame
      return true
    }
  }
  return false
}
