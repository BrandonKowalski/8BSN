import { expect, test } from 'vitest'
import { AudioRing } from './ringBuffer'
import { createShared } from './shared'

test('createShared allocates every block at its contract size', () => {
  const s = createShared()
  expect(s.control.length).toBe(5)
  expect(s.input.length).toBe(2)
  expect(s.video.byteLength).toBe(245760 * 3)
  expect(new AudioRing(s.ring).free()).toBe(8192)
})
