import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('App renders the title', () => {
  render(<App />)
  expect(screen.getByText('Tecmo Broadcast')).toBeInTheDocument()
})
