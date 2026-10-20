import { expect, test } from 'vitest'
import { cutOut } from './cutout'

const W = 40
const H = 30

function frame(paint: (x: number, y: number) => [number, number, number] | null) {
  const data = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = paint(x, y) ?? [0, 0, 0]
      data.set([...c, 255], (y * W + x) * 4)
    }
  }
  return data
}

const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1
const alpha = (h: { width: number; data: Uint8ClampedArray }, x: number, y: number) => h.data[(y * h.width + x) * 4 + 3]

test('the cut keeps the largest shape with a one pixel outline, fills enclosed holes and drops separate marks', () => {
  const data = frame((x, y) => {
    if (inBox(x, y, 14, 12, 16, 14)) return null
    if (inBox(x, y, 10, 8, 20, 18)) return [200, 30, 30]
    if (inBox(x, y, 2, 24, 4, 26)) return [255, 255, 255]
    return null
  })
  const helmet = cutOut(data, W, { x: 0, y: 0, w: W, h: H })!
  expect(helmet.width).toBe(13)
  expect(helmet.height).toBe(13)
  expect(alpha(helmet, 0, 0)).toBe(255)
  expect(Array.from(helmet.data.subarray(0, 3))).toEqual([0, 0, 0])
  expect(alpha(helmet, 5, 5)).toBe(255)
  expect(Array.from(helmet.data.subarray((5 * 13 + 5) * 4, (5 * 13 + 5) * 4 + 3))).toEqual([0, 0, 0])
})

test('pixels outside the shape and its outline are transparent', () => {
  const data = frame((x, y) => (inBox(x, y, 10, 10, 12, 20) || inBox(x, y, 10, 18, 20, 20) ? [255, 255, 255] : null))
  const helmet = cutOut(data, W, { x: 0, y: 0, w: W, h: H })!
  expect(alpha(helmet, helmet.width - 1, 0)).toBe(0)
  expect(alpha(helmet, 1, 1)).toBe(255)
})

test('an empty region gives no helmet', () => {
  expect(cutOut(frame(() => null), W, { x: 0, y: 0, w: W, h: H })).toBeNull()
})
