import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('App renders the title and the crt view with the canvas slot', () => {
  render(<App />)
  expect(screen.getByText('Tecmo Broadcast')).toBeInTheDocument()
  const view = screen.getByTestId('crt-view')
  expect(view.querySelector('canvas')).not.toBeNull()
})
