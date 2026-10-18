import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import type { PlayResult } from '../../../game/playTracker'
import ReplayStage from './ReplayStage'
import type { ReplayView } from './useReplay'

afterEach(cleanup)

const play = { index: 3, summary: 'COOK 25 YD RUN' } as PlayResult

const view = (overrides: Partial<ReplayView>): ReplayView => ({ play, look: 'footage', player: null, canvas: null, skip: () => undefined, ...overrides })

test('the footage look mounts the replay canvas in the window', () => {
  const canvas = document.createElement('canvas')
  render(<ReplayStage view={view({ canvas })} />)
  const stage = screen.getByTestId('replay-stage')
  expect(stage).toHaveTextContent('INSTANT REPLAY')
  expect(stage).toHaveTextContent('GAME FOOTAGE')
  expect(stage.querySelector('canvas')).toBe(canvas)
})

test('the other looks show their label and no footage canvas', () => {
  const canvas = document.createElement('canvas')
  render(<ReplayStage view={view({ look: 'topdown' })} />)
  const stage = screen.getByTestId('replay-stage')
  expect(stage).toHaveTextContent('TOP DOWN')
  expect(stage).toHaveClass('replay-topdown')
  expect(stage.querySelector('canvas')).toBeNull()
  cleanup()
  render(<ReplayStage view={view({ look: 'telestrator', canvas })} />)
  expect(screen.getByTestId('replay-stage')).toHaveTextContent('TELESTRATOR')
  expect(screen.getByTestId('replay-stage').querySelector('canvas')).toBeNull()
})
