import { expect, test } from 'vitest'
import { AudioRing } from './ringBuffer'

test('ring wraps and preserves order', () => {
  const ring = new AudioRing(new SharedArrayBuffer(AudioRing.bytes(8)))
  ring.write(new Float32Array([1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]))
  const l = new Float32Array(4), r = new Float32Array(4)
  expect(ring.read([l, r])).toBe(4)
  ring.write(new Float32Array([7, -7, 8, -8, 9, -9, 10, -10]))
  expect(ring.available()).toBe(6)
  ring.read([l, r])
  expect([...l]).toEqual([5, 6, 7, 8])
  expect([...r]).toEqual([-5, -6, -7, -8])
})

test('ring write never overwrites unread audio', () => {
  const ring = new AudioRing(new SharedArrayBuffer(AudioRing.bytes(4)))
  expect(ring.write(new Float32Array(20))).toBe(4)
  expect(ring.free()).toBe(0)
  expect(ring.available()).toBe(4)
})

test('short read zero fills', () => {
  const ring = new AudioRing(new SharedArrayBuffer(AudioRing.bytes(8)))
  ring.write(new Float32Array([1, 1]))
  const l = new Float32Array([9, 9]), r = new Float32Array([9, 9])
  expect(ring.read([l, r])).toBe(1)
  expect(l[1]).toBe(0)
  expect(r[1]).toBe(0)
})

test('ring survives many index wraparounds', () => {
  const ring = new AudioRing(new SharedArrayBuffer(AudioRing.bytes(4)))
  const l = new Float32Array(3), r = new Float32Array(3)
  for (let i = 0; i < 1000; i++) {
    expect(ring.write(new Float32Array([i, -i, i + 1, -i - 1, i + 2, -i - 2]))).toBe(3)
    expect(ring.read([l, r])).toBe(3)
    expect([...l]).toEqual([i, i + 1, i + 2])
    expect([...r]).toEqual([-i, -i - 1, -i - 2])
  }
})

test('read index view reflects consumption', () => {
  const ring = new AudioRing(new SharedArrayBuffer(AudioRing.bytes(4)))
  ring.write(new Float32Array(8))
  const before = Atomics.load(ring.readIndexView(), 0)
  ring.read([new Float32Array(2), new Float32Array(2)])
  expect(Atomics.load(ring.readIndexView(), 0)).not.toBe(before)
})
