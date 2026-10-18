import { expect, test } from 'vitest'
import { framesToRun, pacedRate, resampleRatio } from './pacing'

test('pacing', () => {
  expect(resampleRatio(2048, 2048)).toBe(1)
  expect(resampleRatio(0, 2048)).toBeCloseTo(1.005)
  expect(resampleRatio(8192, 2048)).toBeCloseTo(0.995)
  expect(framesToRun(8000, 2048, 800)).toBe(0)
  expect(framesToRun(0, 2048, 800)).toBe(2)
  expect(framesToRun(1500, 2048, 800)).toBe(1)
})

test('replays run at three quarters speed', () => {
  expect(pacedRate(48000, 1)).toBe(48000)
  const perFrame = pacedRate(48000, 0.75) / 60
  expect(perFrame).toBeCloseTo(1066.667)
  expect(48000 / perFrame).toBeCloseTo(45)
})
