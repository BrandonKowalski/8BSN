import { expect, test } from 'vitest'
import { drawLatest } from './presenter'
import { VIDEO_FRAME_BYTES, VIDEO_FRAME_COUNT, VIDEO_WIDTH } from './shared'

test('drawLatest copies the visible rows of the chosen frame and puts them', () => {
  const video = new SharedArrayBuffer(VIDEO_FRAME_BYTES * VIDEO_FRAME_COUNT)
  const frame1 = new Uint8Array(video, VIDEO_FRAME_BYTES, VIDEO_FRAME_BYTES)
  const rowBytes = VIDEO_WIDTH * 4
  for (let x = 0; x < VIDEO_WIDTH; x++) frame1.set([10, 20, 30, 255], 8 * rowBytes + x * 4)
  frame1.set([1, 2, 3, 255], 7 * rowBytes)
  frame1.set([4, 5, 6, 255], 231 * rowBytes)
  frame1.set([7, 8, 9, 255], 232 * rowBytes)
  const image = { width: 256, height: 224, data: new Uint8ClampedArray(256 * 224 * 4) } as ImageData
  const puts: [ImageData, number, number][] = []
  const ctx = { putImageData: (img: ImageData, x: number, y: number) => puts.push([img, x, y]) } as unknown as CanvasRenderingContext2D

  drawLatest(ctx, video, 1, image)

  expect([...image.data.subarray(0, 4)]).toEqual([10, 20, 30, 255])
  expect([...image.data.subarray(223 * rowBytes, 223 * rowBytes + 4)]).toEqual([4, 5, 6, 255])
  expect(image.data.includes(1)).toBe(false)
  expect(image.data.includes(7)).toBe(false)
  expect(puts).toEqual([[image, 0, 0]])
})
