import { expect, it } from 'vitest'
import { anchorMatches } from './anchor'

const ram = (values: Record<number, number>) => {
  const bytes = new Uint8Array(256)
  for (const [offset, value] of Object.entries(values)) bytes[Number(offset)] = value
  return bytes
}

it('oneOf passes only for listed values', () => {
  const tests = [{ offset: 7, oneOf: [0x11, 0x12] }]
  expect(anchorMatches(ram({ 7: 0x12 }), tests)).toBe(true)
  expect(anchorMatches(ram({ 7: 0x13 }), tests)).toBe(false)
})

it('zero true requires a zero value', () => {
  expect(anchorMatches(ram({ 3: 0 }), [{ offset: 3, zero: true }])).toBe(true)
  expect(anchorMatches(ram({ 3: 1 }), [{ offset: 3, zero: true }])).toBe(false)
})

it('zero false requires a non-zero value', () => {
  expect(anchorMatches(ram({ 3: 1 }), [{ offset: 3, zero: false }])).toBe(true)
  expect(anchorMatches(ram({ 3: 0 }), [{ offset: 3, zero: false }])).toBe(false)
})

it('a mask limits the bits that are tested', () => {
  const tests = [{ offset: 5, mask: 0x04, zero: false }]
  expect(anchorMatches(ram({ 5: 0xfb }), tests)).toBe(false)
  expect(anchorMatches(ram({ 5: 0x04 }), tests)).toBe(true)
  expect(anchorMatches(ram({ 5: 0x95 }), [{ offset: 5, mask: 0x90, oneOf: [0x90] }])).toBe(true)
})

it('every test must pass and a test with no condition passes', () => {
  const tests = [{ offset: 1, zero: false }, { offset: 2, zero: true }, { offset: 9 }]
  expect(anchorMatches(ram({ 1: 1 }), tests)).toBe(true)
  expect(anchorMatches(ram({ 1: 1, 2: 1 }), tests)).toBe(false)
})

it('an empty list matches', () => {
  expect(anchorMatches(ram({}), [])).toBe(true)
})
