import { expect, test } from 'vitest'
import type { Cut } from './cutout'
import { faceLeft } from './mirror'

const W = 12
const H = 5
const SHELL = [200, 0, 0]
const INK = [255, 255, 255]

function paint(rows: string[]) {
  const frame = new Uint8Array(W * H * 4)
  rows.forEach((row, y) => [...row].forEach((c, x) => frame.set([...(c === '#' ? INK : SHELL), 255], (y * W + x) * 4)))
  return frame
}

const whole = (frame: Uint8Array): Cut => ({ width: W, height: H, data: new Uint8ClampedArray(frame), x: 0, y: 0 })

const read = (data: Uint8ClampedArray) =>
  Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (data[(y * W + x) * 4] === 255 ? '#' : data[(y * W + x) * 4 + 3] ? '.' : ' ')).join(''))

const BARE = paint(['............', '............', '............', '............', '............'])

test('a mirrored logo flips with the shell', () => {
  const frame = paint(['............', '.##.........', '.#..........', '.#..........', '............'])
  expect(read(faceLeft(whole(frame), frame, BARE, W, 'mirror').data)).toEqual(['............', '.........##.', '..........#.', '..........#.', '............'])
})

test('a kept logo moves to the mirrored spot without flipping', () => {
  const frame = paint(['............', '.##.........', '.#..........', '.#..........', '............'])
  expect(read(faceLeft(whole(frame), frame, BARE, W, 'keep').data)).toEqual(['............', '.........##.', '.........#..', '.........#..', '............'])
})

test('letters inside a logo stay readable while the logo around them flips', () => {
  const frame = paint(['#####.......', '#..##.......', '#.###.......', '#####.......', '............'])
  expect(read(faceLeft(whole(frame), frame, BARE, W, 'letters').data)).toEqual(['.......#####', '.......##..#', '.......##.##', '.......#####', '............'])
})

test('a short streak beside a kept logo flips with the shell', () => {
  const frame = paint(['##..#.......', '#...........', '#...........', '#...........', '............'])
  expect(read(faceLeft(whole(frame), frame, BARE, W, 'keep').data)).toEqual(['.......#..##', '..........#.', '..........#.', '..........#.', '............'])
})

test('letters side by side stay together as one decal', () => {
  const frame = paint(['#.#.#.#.....', '###.##......', '#.#.#.#.....', '............', '............'])
  expect(read(faceLeft(whole(frame), frame, BARE, W, 'keep').data)).toEqual(['.....#.#.#.#', '.....###.##.', '.....#.#.#.#', '............', '............'])
})

test('pixels in a highlight color flip with the shell even when they touch the logo', () => {
  const frame = paint(['##.#........', '#..#........', '#...........', '#...........', '............'])
  frame.set([146, 144, 255, 255], (0 * W + 3) * 4)
  frame.set([146, 144, 255, 255], (1 * W + 3) * 4)
  const left = faceLeft(whole(frame), frame, BARE, W, 'keep', [0x9290ff])
  expect(read(left.data)).toEqual(['..........##', '..........#.', '..........#.', '..........#.', '............'])
  expect(Array.from(left.data.subarray((0 * W + 8) * 4, (0 * W + 8) * 4 + 3))).toEqual([146, 144, 255])
})

test('a skewed logo stays readable and tilts and leans by the set amounts', () => {
  const frame = paint(['............', '.###........', '............', '............', '............'])
  expect(read(faceLeft(whole(frame), frame, BARE, W, { tilt: -1, lean: 0 }).data)).toEqual(['..........#.', '.........#..', '........#...', '............', '............'])
  const tall = paint(['.#..........', '.#..........', '.#..........', '............', '............'])
  expect(read(faceLeft(whole(tall), tall, BARE, W, { tilt: 0, lean: 1 }).data)).toEqual(['.........#..', '..........#.', '...........#', '............', '............'])
})
