import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { PlayResult } from '../../../game/playTracker'
import TopDownLook from './TopDownLook'

vi.mock('../../../game/analysis', async (original) => ({
  ...(await original<typeof import('../../../game/analysis')>()),
  separation: () => ({ slot: 3, defender: 40, sample: 1, yards: 4.1 }),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const row = Array.from({ length: 22 }, (_, i) => ({ x: 0x800 + i * 8, y: 0x30 + (i % 11) * 12 }))

const play = {
  index: 1,
  offense: 0,
  thrown: true,
  kind: 'scrimmage',
  ball: [{ ...row[0], slot: 0 }, { ...row[3], slot: 3 }],
  field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
  startFrame: 100,
  endFrame: 200,
  tracks: { frames: [100, 160], players: [row, row] },
  people: {},
  pass: null,
  fumble: null,
  kickResult: null,
  returner: null,
  returnYards: null,
} as unknown as PlayResult

test('top-down skips the separation instead of throwing when the sample has no defender slot', async () => {
  vi.stubGlobal('requestAnimationFrame', (tick: FrameRequestCallback) => setTimeout(() => tick(performance.now() + 60000), 0))
  render(<TopDownLook play={play} abbrs={['BUF', 'MIA']} player={() => null} />)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  expect(screen.getAllByTestId('token')).toHaveLength(22)
  expect(screen.queryByTestId('topdown-separation')).toBeNull()
  expect(screen.queryByTestId('topdown-open')).toBeNull()
})
