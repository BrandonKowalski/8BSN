import { cleanup, fireEvent, render } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import ChantIntro, { canPlayIntro } from './ChantIntro'
import Wordmark from './Wordmark'

const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation)

beforeEach(() => {
  Element.prototype.animate = animate
})

afterEach(() => {
  cleanup()
  delete (Element.prototype as Partial<Element>).animate
  vi.unstubAllGlobals()
  animate.mockClear()
})

function setup() {
  const chromeRef = createRef<HTMLDivElement>()
  const onDone = vi.fn()
  const view = render(
    <div className="chrome" ref={chromeRef}>
      <h1 className="brand">
        <Wordmark variant="c3" />
      </h1>
      <ChantIntro chromeRef={chromeRef} onDone={onDone} />
    </div>,
  )
  return { onDone, overlay: view.container.querySelector('.chant') as HTMLElement }
}

test('the intro plays only where the browser animates and motion is welcome', () => {
  expect(canPlayIntro()).toBe(true)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }))
  expect(canPlayIntro()).toBe(false)
  vi.unstubAllGlobals()
  delete (Element.prototype as Partial<Element>).animate
  expect(canPlayIntro()).toBe(false)
})

test('the chant spells the network name with the initials marked', () => {
  const { overlay } = setup()
  expect([...overlay.querySelectorAll('.chant-line')].map((line) => line.textContent)).toEqual(['8-BIT', 'SPORTS', 'NETWORK'])
  expect([...overlay.querySelectorAll('.chant-initial')].map((span) => span.textContent)).toEqual(['8', 'B', 'S', 'N'])
})

test('a key skips the intro and goes no further', () => {
  const { onDone } = setup()
  const later = vi.fn()
  window.addEventListener('keydown', later)
  fireEvent.keyDown(document.body, { code: 'Enter' })
  window.removeEventListener('keydown', later)
  expect(onDone).toHaveBeenCalledTimes(1)
  expect(later).not.toHaveBeenCalled()
})

test('a click skips the intro', () => {
  const { onDone, overlay } = setup()
  fireEvent.click(overlay)
  expect(onDone).toHaveBeenCalledTimes(1)
})
