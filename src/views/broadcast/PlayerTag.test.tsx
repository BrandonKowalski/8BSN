import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { playerLabel, TAG_FITS } from '../../game/format'
import type { RosterPlayer } from '../../game/roster'
import PlayerTag from './PlayerTag'

afterEach(cleanup)

const allen: RosterPlayer = { first: 'Josh', last: 'Allen', number: 17, position: 'QB' }

test('a player tag shows the number, the name and the position in their own styles', () => {
  render(<PlayerTag player={allen} fit="full" />)
  const tag = screen.getByTestId('player-tag')
  expect(tag).toHaveTextContent(/^#17 JOSH ALLEN QB$/)
  expect(tag.querySelector('.player-tag-num')).toHaveTextContent(/^#17$/)
  expect(tag.querySelector('.player-tag-name')).toHaveTextContent(/^JOSH ALLEN$/)
  expect(tag.querySelector('.player-tag-pos')).toHaveTextContent(/^QB$/)
})

test('a player tag reads the same as the label at every fit', () => {
  for (const fit of TAG_FITS) {
    const { unmount } = render(<PlayerTag player={allen} fit={fit} />)
    expect(screen.getByTestId('player-tag').textContent).toBe(playerLabel(allen, fit))
    unmount()
  }
  render(<PlayerTag player={allen} fit="lastNoPos" />)
  expect(screen.getByTestId('player-tag').querySelector('.player-tag-pos')).toBeNull()
})

test('the number is muted and the position uses the small unit style', () => {
  const css = readFileSync(join(__dirname, 'broadcast.css'), 'utf8')
  expect(css).toMatch(/\.player-tag-num \{[^}]*opacity: 0\.7;/)
  expect(css).toMatch(/\.player-tag-pos \{[^}]*font-size: 0\.6em;[^}]*color: #9cf;/)
})
