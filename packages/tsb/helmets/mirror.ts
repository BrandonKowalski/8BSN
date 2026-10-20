import type { Cut, Rgba } from './cutout'

export type Facing = { right: Cut; left: Rgba }
export type Skew = { tilt: number; lean: number }
export type Logo = 'mirror' | 'keep' | 'letters' | Skew
export type Placed = { x: number; y: number; rgba: readonly [number, number, number, number] }

type Pixel = [number, number]

const NEAR = 3
const LETTER_HEIGHT = 0.45
const PALETTE_SHARE = 0.1

function components(pixels: Pixel[]): Pixel[][] {
  const index = new Map(pixels.map(([x, y], n) => [`${x},${y}`, n]))
  const seen = new Uint8Array(pixels.length)
  const found: Pixel[][] = []
  for (let start = 0; start < pixels.length; start++) {
    if (seen[start]) continue
    seen[start] = 1
    const group: Pixel[] = []
    const stack = [start]
    while (stack.length) {
      const [x, y] = pixels[stack.pop()!]
      group.push([x, y])
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = index.get(`${x + dx},${y + dy}`)
          if (n === undefined || seen[n]) continue
          seen[n] = 1
          stack.push(n)
        }
      }
    }
    found.push(group)
  }
  return found
}

type Box = { x0: number; y0: number; x1: number; y1: number }

const boxOf = (pixels: Pixel[]): Box => ({
  x0: Math.min(...pixels.map(([x]) => x)),
  y0: Math.min(...pixels.map(([, y]) => y)),
  x1: Math.max(...pixels.map(([x]) => x)),
  y1: Math.max(...pixels.map(([, y]) => y)),
})

function decalOf(pixels: Pixel[], colorOf: (pixel: Pixel) => number): Pixel[] {
  const parts = components(pixels).sort((a, b) => b.length - a.length)
  if (parts.length === 0) return []
  const decal = [...parts.shift()!]
  const anchor = boxOf(decal)
  const tally = (part: Pixel[]) => {
    const counts = new Map<number, number>()
    for (const pixel of part) counts.set(colorOf(pixel), (counts.get(colorOf(pixel)) ?? 0) + 1)
    return counts
  }
  const palette = new Set([...tally(decal)].filter(([, n]) => n >= decal.length * PALETTE_SHARE).map(([color]) => color))
  const main = (part: Pixel[]) => [...tally(part)].sort((a, b) => b[1] - a[1])[0][0]
  let box = anchor
  let grew = true
  while (grew) {
    grew = false
    for (let n = 0; n < parts.length; n++) {
      const part = boxOf(parts[n])
      const tall = part.y1 - part.y0 + 1
      const overlap = Math.min(part.y1, anchor.y1) - Math.max(part.y0, anchor.y0) + 1
      const gap = Math.max(part.x0 - box.x1, box.x0 - part.x1) - 1
      if (overlap * 2 < tall || tall < (anchor.y1 - anchor.y0 + 1) * LETTER_HEIGHT || gap > NEAR || !palette.has(main(parts[n]))) continue
      decal.push(...parts.splice(n, 1)[0])
      box = boxOf(decal)
      grew = true
      n--
    }
  }
  return decal
}

function lettersOf(group: Pixel[]): Pixel[] {
  const x0 = Math.min(...group.map(([x]) => x)) - 1
  const y0 = Math.min(...group.map(([, y]) => y)) - 1
  const bw = Math.max(...group.map(([x]) => x)) - x0 + 2
  const bh = Math.max(...group.map(([, y]) => y)) - y0 + 2
  const solid = new Uint8Array(bw * bh)
  for (const [x, y] of group) solid[(y - y0) * bw + x - x0] = 1
  const outside = new Uint8Array(bw * bh)
  const stack = [0]
  outside[0] = 1
  while (stack.length) {
    const q = stack.pop()!
    const qx = q % bw
    const qy = (q - qx) / bw
    for (const [nx, ny] of [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]]) {
      const n = ny * bw + nx
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh || outside[n] || solid[n]) continue
      outside[n] = 1
      stack.push(n)
    }
  }
  const hole = (x: number, y: number) => x >= 0 && y >= 0 && x < bw && y < bh && !solid[y * bw + x] && !outside[y * bw + x]
  const letters: Pixel[] = []
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (hole(x, y)) letters.push([x + x0, y + y0])
      else if (solid[y * bw + x] && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => hole(x + dx, y + dy)))) letters.push([x + x0, y + y0])
    }
  }
  return letters
}

export function layersOf(cut: Cut, frame: Uint8Array, bare: Uint8Array, frameWidth: number, logo: Logo, shine: readonly number[] = []): { base: Rgba; decal: Placed[] } {
  const { width: w, height: h } = cut
  const at = (x: number, y: number) => ((cut.y + y) * frameWidth + cut.x + x) * 4
  const opaque = (x: number, y: number) => cut.data[(y * w + x) * 4 + 3] === 255
  const base = new Uint8ClampedArray(cut.data)
  let kept: Pixel[] = []
  if (logo !== 'mirror') {
    const pixels: Pixel[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = at(x, y)
        const changed = frame[i] !== bare[i] || frame[i + 1] !== bare[i + 1] || frame[i + 2] !== bare[i + 2]
        if (opaque(x, y) && changed && !shine.includes((frame[i] << 16) | (frame[i + 1] << 8) | frame[i + 2])) pixels.push([x, y])
      }
    }
    const decal = decalOf(pixels, ([x, y]) => {
      const o = (y * w + x) * 4
      return (cut.data[o] << 16) | (cut.data[o + 1] << 8) | cut.data[o + 2]
    })
    if (logo !== 'letters') {
      for (const [x, y] of decal) {
        const i = at(x, y)
        base.set([bare[i], bare[i + 1], bare[i + 2]], (y * w + x) * 4)
      }
      kept = decal
    } else if (decal.length > 0) {
      const letters = lettersOf(decal)
      const taken = new Set(letters.map(([x, y]) => y * w + x))
      const counts = new Map<number, number>()
      for (const [x, y] of decal) {
        if (taken.has(y * w + x)) continue
        const o = (y * w + x) * 4
        const key = (cut.data[o] << 16) | (cut.data[o + 1] << 8) | cut.data[o + 2]
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      const fill = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
      for (const [x, y] of letters) base.set([fill >> 16, (fill >> 8) & 255, fill & 255, 255], (y * w + x) * 4)
      kept = letters
    }
  }
  const flipped = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const from = (y * w + (w - 1 - x)) * 4
      flipped.set(base.subarray(from, from + 4), (y * w + x) * 4)
    }
  }
  if (kept.length === 0) return { base: { width: w, height: h, data: flipped }, decal: [] }
  const { x0, x1 } = boxOf(kept)
  const decal = kept.map(([x, y]): Placed => {
    const o = (y * w + x) * 4
    return { x: w - 1 - x1 + x - x0, y, rgba: [cut.data[o], cut.data[o + 1], cut.data[o + 2], cut.data[o + 3]] }
  })
  return { base: { width: w, height: h, data: flipped }, decal }
}

export function skew(decal: Placed[], { tilt, lean }: Skew): Placed[] {
  if (decal.length === 0) return decal
  const cx = decal.reduce((sum, p) => sum + p.x, 0) / decal.length
  const cy = decal.reduce((sum, p) => sum + p.y, 0) / decal.length
  return decal.map((p) => ({ ...p, x: p.x + Math.round(lean * (p.y - cy)), y: p.y + Math.round(tilt * (p.x - cx)) }))
}

export function faceLeft(cut: Cut, frame: Uint8Array, bare: Uint8Array, frameWidth: number, logo: Logo, shine: readonly number[] = []): Rgba {
  const { base, decal } = layersOf(cut, frame, bare, frameWidth, logo, shine)
  const data = new Uint8ClampedArray(base.data)
  for (const p of typeof logo === 'object' ? skew(decal, logo) : decal) {
    if (p.x < 0 || p.x >= base.width || p.y < 0 || p.y >= base.height) continue
    data.set(p.rgba, (p.y * base.width + p.x) * 4)
  }
  return { width: base.width, height: base.height, data }
}
