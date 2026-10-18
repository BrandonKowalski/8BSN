import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import Wordmark from './Wordmark'

afterEach(cleanup)

test('the wordmark spells 8BSN with the 8 set apart', () => {
  render(<Wordmark variant="c2" />)
  const mark = screen.getByLabelText('8BSN')
  expect(mark.textContent).toBe('8BSN')
  expect(mark.querySelector('.wm-8')?.textContent).toBe('8')
  expect(mark.querySelector('.wm-rest')?.textContent).toBe('BSN')
  expect(mark.querySelector('.wm-stripe')).toBeNull()
})

test('c3 has three stripes', () => {
  render(<Wordmark variant="c3" />)
  const stripes = screen.getByLabelText('8BSN').querySelectorAll('.wm-stripe')
  expect(stripes).toHaveLength(3)
  expect([...stripes].map((s) => s.className)).toEqual(['wm-stripe wm-gold', 'wm-stripe wm-red', 'wm-stripe wm-blue'])
})
