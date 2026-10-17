import { VIDEO_FRAME_BYTES, VIDEO_WIDTH } from './shared'

export const VISIBLE_TOP = 8
export const VISIBLE_HEIGHT = 224

const ROW_BYTES = VIDEO_WIDTH * 4

export function drawLatest(ctx: CanvasRenderingContext2D, video: SharedArrayBuffer, index: number, image: ImageData): void {
  const start = index * VIDEO_FRAME_BYTES + VISIBLE_TOP * ROW_BYTES
  image.data.set(new Uint8ClampedArray(video, start, VISIBLE_HEIGHT * ROW_BYTES))
  ctx.putImageData(image, 0, 0)
}
