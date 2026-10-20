import { describe, expect, it, vi } from 'vitest'
import { fetchLeague, fetchStandings, parseScoreboard, parseStandings, recordOf } from './espn'
import live from './fixtures/live.json'
import week6 from './fixtures/week6.json'
import allPre from './fixtures/allPre.json'

const respond = (body: unknown) => ({ ok: true, json: async () => body }) as Response

const previousWeek = (week: number, states: string[]) => ({
  season: { year: 2026, type: 2 },
  week: { number: week },
  events: states.map((state, i) => ({
    id: `p${i}`,
    competitions: [
      {
        competitors: [
          { homeAway: 'home', score: '20', team: { abbreviation: 'AAA' } },
          { homeAway: 'away', score: '17', team: { abbreviation: 'BBB' } },
        ],
      },
    ],
    status: { type: { state, shortDetail: state === 'post' ? 'Final' : 'x' } },
  })),
})

describe('parseScoreboard', () => {
  it('reads games with numeric scores from a live payload', () => {
    const parsed = parseScoreboard(live)
    expect(parsed.season).toBe(2026)
    expect(parsed.seasonType).toBe(2)
    expect(parsed.week).toBe(6)
    expect(parsed.games).toHaveLength(3)
    expect(parsed.games.map((g) => g.state)).toEqual(['post', 'in', 'in'])
    expect(parsed.games[1].detail).toBe('4th 2:10')
    for (const g of parsed.games) {
      expect(typeof g.away.score).toBe('number')
      expect(typeof g.home.score).toBe('number')
      expect(g.away.abbr).toMatch(/^[A-Z]+$/)
    }
    expect(parsed.games[1].home.score).toBe(24)
    expect(parsed.games[1].away.score).toBe(21)
  })

  it('skips malformed events and tolerates junk', () => {
    const parsed = parseScoreboard({
      season: { year: 2026, type: 2 },
      week: { number: 3 },
      events: [null, {}, { id: 'x', competitions: [] }, ...(live.events as unknown[]).slice(0, 1)],
    })
    expect(parsed.games).toHaveLength(1)
    expect(parseScoreboard(null).games).toEqual([])
    expect(parseScoreboard('nope').games).toEqual([])
  })
})

describe('standings', () => {
  const standings = {
    children: [
      { standings: { entries: [{ team: { abbreviation: 'KC' }, stats: [{ name: 'wins', type: 'wins', displayValue: '5' }, { name: 'overall', type: 'total', summary: '5-0', displayValue: '5-0' }] }] } },
      { standings: { entries: [{ team: { abbreviation: 'WSH' }, stats: [{ type: 'total', displayValue: '1-5' }] }, { team: { abbreviation: 'NYG' }, stats: [] }, null] } },
    ],
  }

  it('reads every team record, bye or not', () => {
    const records = parseStandings(standings)
    expect([...records]).toEqual([
      ['KC', '5-0'],
      ['WSH', '1-5'],
    ])
    expect(parseStandings(null).size).toBe(0)
    expect(parseStandings({ children: 'nope' }).size).toBe(0)
  })

  it('looks a record up by the ROM abbreviation', () => {
    const records = parseStandings(standings)
    const rom = (espn: string) => (espn === 'WSH' ? 'WAS' : espn)
    expect(recordOf(records, rom, 'WAS')).toBe('1-5')
    expect(recordOf(records, rom, 'KC')).toBe('5-0')
    expect(recordOf(records, rom, 'BUF')).toBeNull()
    expect(recordOf(null, rom, 'KC')).toBeNull()
  })

  it('fetches the standings and gives up quietly on failure', async () => {
    expect([...((await fetchStandings(vi.fn(async () => respond(standings)) as unknown as typeof fetch)) ?? [])]).toHaveLength(2)
    expect(await fetchStandings(vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch)).toBeNull()
    expect(await fetchStandings(vi.fn(async () => respond({ children: [] })) as unknown as typeof fetch)).toBeNull()
    expect(await fetchStandings(vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBeNull()
  })
})

describe('fetchLeague', () => {
  it('once the week starts only its games show', async () => {
    const fetchFn = vi.fn(async () => respond(week6))
    const games = await fetchLeague(fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(games).toHaveLength(14)
    expect(games?.map((g) => g.state)).toEqual([...Array(2).fill('pre'), ...Array(12).fill('post')])
  })

  it('orders live first, then upcoming by kickoff, then finals', async () => {
    const games = await fetchLeague(vi.fn(async () => respond(live)))
    expect(games?.map((g) => g.state)).toEqual(['in', 'in', 'post'])
    const mixed = await fetchLeague(vi.fn(async () => respond(week6)))
    expect(mixed?.slice(0, 2).map((g) => g.away.abbr)).toEqual(['GB', 'SF'])
  })

  it('upcoming games carry their kickoff date', async () => {
    const games = await fetchLeague(vi.fn(async () => respond(week6)))
    expect(games?.[0].date).toBe('2026-10-19T00:20Z')
  })

  it('before the first kickoff last week finals show', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(respond({ ...allPre, week: { number: 6 } }))
      .mockResolvedValueOnce(respond(previousWeek(5, ['post', 'post', 'in', 'pre'])))
    const games = await fetchLeague(fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    const url = String(fetchFn.mock.calls[1][0])
    expect(url).toContain('week=5')
    expect(url).toContain('seasontype=2')
    expect(url).toContain('dates=2026')
    expect(games).toHaveLength(2)
    expect(games?.every((g) => g.state === 'post')).toBe(true)
  })

  it('never mixes last week finals into a started week', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(respond(previousWeek(6, ['post', 'pre', 'pre'])))
    const games = await fetchLeague(fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(games?.map((g) => g.state)).toEqual(['pre', 'pre', 'post'])
  })

  it('uses the last preseason week when regular season week 1 has nothing started', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(respond({ ...allPre, week: { number: 1 } }))
      .mockResolvedValueOnce(respond(previousWeek(4, ['post'])))
    const games = await fetchLeague(fetchFn)
    const url = String(fetchFn.mock.calls[1][0])
    expect(url).toContain('seasontype=1')
    expect(url).toContain('week=4')
    expect(games).toHaveLength(1)
  })

  it('returns null for week 1 when the calendar is missing', async () => {
    const { leagues: _leagues, ...noCalendar } = allPre
    const fetchFn = vi.fn().mockResolvedValueOnce(respond({ ...noCalendar, week: { number: 1 } }))
    expect(await fetchLeague(fetchFn)).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('returns null for week 1 when the preseason request fails', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(respond({ ...allPre, week: { number: 1 } }))
      .mockRejectedValueOnce(new Error('down'))
    expect(await fetchLeague(fetchFn)).toBeNull()
  })

  it('uses the last regular season week for postseason week 1 with nothing started', async () => {
    const postseason = {
      ...allPre,
      season: { year: 2026, type: 3 },
      week: { number: 1 },
      leagues: [{ calendar: [{ value: '2', entries: [{ value: '1' }, { value: '17' }, { value: '18' }] }] }],
    }
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(respond(postseason))
      .mockResolvedValueOnce(respond(previousWeek(18, ['post'])))
    const games = await fetchLeague(fetchFn)
    const url = String(fetchFn.mock.calls[1][0])
    expect(url).toContain('seasontype=2')
    expect(url).toContain('week=18')
    expect(games).toHaveLength(1)
  })

  it('returns null for postseason week 1 without a regular season calendar', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(respond({ ...allPre, season: { year: 2026, type: 3 }, week: { number: 1 } }))
    expect(await fetchLeague(fetchFn)).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('returns null for preseason week 1 and for a missing season year', async () => {
    const pre = vi.fn().mockResolvedValueOnce(respond({ ...allPre, season: { year: 2026, type: 1 }, week: { number: 1 } }))
    expect(await fetchLeague(pre)).toBeNull()
    expect(pre).toHaveBeenCalledTimes(1)
    const noYear = vi.fn().mockResolvedValueOnce(respond({ ...allPre, season: { type: 2 } }))
    expect(await fetchLeague(noYear)).toBeNull()
    expect(noYear).toHaveBeenCalledTimes(1)
  })

  it('returns null when the current week is missing', async () => {
    const { week: _week, ...noWeek } = allPre
    const fetchFn = vi.fn().mockResolvedValueOnce(respond(noWeek))
    expect(await fetchLeague(fetchFn)).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('returns null when the network rejects', async () => {
    expect(await fetchLeague(vi.fn().mockRejectedValue(new Error('offline')))).toBeNull()
  })

  it('returns null on a non-ok response or unparseable body', async () => {
    expect(await fetchLeague(vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))).toBeNull()
    const bad = { ok: true, json: async () => Promise.reject(new Error('bad json')) } as unknown as Response
    expect(await fetchLeague(vi.fn().mockResolvedValue(bad))).toBeNull()
  })
})
