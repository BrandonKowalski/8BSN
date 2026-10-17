import { expect, test } from 'vitest'
import { emptySnapshot, readSnapshot, SNAPSHOT_BYTES, writeSnapshot } from './snapshot'

test('reader rejects a snapshot while the writer holds an odd sequence', () => {
  const sab = new SharedArrayBuffer(SNAPSHOT_BYTES)
  writeSnapshot(sab, new Uint8Array(2048).fill(7), new Uint8Array(8192), 10)
  Atomics.add(new Int32Array(sab, 0, 1), 0, 1)
  expect(readSnapshot(sab, emptySnapshot())).toBe(false)
})

test('reader returns the last complete snapshot', () => {
  const sab = new SharedArrayBuffer(SNAPSHOT_BYTES), snap = emptySnapshot()
  writeSnapshot(sab, new Uint8Array(2048).fill(7), new Uint8Array(8192).fill(3), 10)
  expect(readSnapshot(sab, snap)).toBe(true)
  expect(snap.ram[100]).toBe(7)
  expect(snap.sram[0]).toBe(3)
  expect(snap.frame).toBe(10)
})

test('later writes replace earlier ones', () => {
  const sab = new SharedArrayBuffer(SNAPSHOT_BYTES), snap = emptySnapshot()
  writeSnapshot(sab, new Uint8Array(2048).fill(1), new Uint8Array(8192).fill(1), 1)
  writeSnapshot(sab, new Uint8Array(2048).fill(2), new Uint8Array(8192).fill(2), 2)
  expect(readSnapshot(sab, snap)).toBe(true)
  expect(snap.ram[2047]).toBe(2)
  expect(snap.sram[8191]).toBe(2)
  expect(snap.frame).toBe(2)
})
