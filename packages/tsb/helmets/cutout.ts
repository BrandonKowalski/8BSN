export type Rgba = { width: number; height: number; data: Uint8ClampedArray }
export type Rect = { x: number; y: number; w: number; h: number }
export type Cut = Rgba & { x: number; y: number }

const DARK = 60

export function cutOut(frame: Uint8Array, frameWidth: number, rect: Rect): Cut | null {
  const { w, h } = rect
  const at = (x: number, y: number) => ((rect.y + y) * frameWidth + rect.x + x) * 4
  const colored = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x, y)
      if (frame[i] + frame[i + 1] + frame[i + 2] > DARK) colored[y * w + x] = 1
    }
  }
  const grown = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let dy = -1; dy <= 1 && !grown[y * w + x]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && colored[ny * w + nx]) {
            grown[y * w + x] = 1
            break
          }
        }
      }
    }
  }
  const label = new Int32Array(w * h)
  const sizes = [0]
  for (let start = 0; start < w * h; start++) {
    if (!grown[start] || label[start]) continue
    const id = sizes.length
    let size = 0
    const stack = [start]
    label[start] = id
    while (stack.length) {
      const p = stack.pop()!
      size++
      const px = p % w
      const py = (p - px) / w
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx
          const ny = py + dy
          const q = ny * w + nx
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && grown[q] && !label[q]) {
            label[q] = id
            stack.push(q)
          }
        }
      }
    }
    sizes.push(size)
  }
  if (sizes.length < 2) return null
  const keepId = sizes.indexOf(Math.max(...sizes.slice(1)))
  const keep = new Uint8Array(w * h)
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== keepId) continue
    keep[p] = 1
    const px = p % w
    const py = (p - px) / w
    x0 = Math.min(x0, px)
    x1 = Math.max(x1, px)
    y0 = Math.min(y0, py)
    y1 = Math.max(y1, py)
  }
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  const outside = new Uint8Array(bw * bh)
  const stack: number[] = []
  const seed = (x: number, y: number) => {
    const q = y * bw + x
    if (!outside[q] && !keep[(y + y0) * w + x + x0]) {
      outside[q] = 1
      stack.push(q)
    }
  }
  for (let x = 0; x < bw; x++) {
    seed(x, 0)
    seed(x, bh - 1)
  }
  for (let y = 0; y < bh; y++) {
    seed(0, y)
    seed(bw - 1, y)
  }
  while (stack.length) {
    const q = stack.pop()!
    const qx = q % bw
    const qy = (q - qx) / bw
    if (qx > 0) seed(qx - 1, qy)
    if (qx < bw - 1) seed(qx + 1, qy)
    if (qy > 0) seed(qx, qy - 1)
    if (qy < bh - 1) seed(qx, qy + 1)
  }
  const data = new Uint8ClampedArray(bw * bh * 4)
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (outside[y * bw + x]) continue
      const i = at(x + x0, y + y0)
      const o = (y * bw + x) * 4
      data[o] = frame[i]
      data[o + 1] = frame[i + 1]
      data[o + 2] = frame[i + 2]
      data[o + 3] = 255
    }
  }
  return { width: bw, height: bh, data, x: rect.x + x0, y: rect.y + y0 }
}
