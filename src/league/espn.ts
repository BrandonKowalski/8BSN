import type { LeagueGame, Records } from '../sdk/types'

export type { LeagueGame, Records }

type Scoreboard = { season: number; seasonType: number; week: number; games: LeagueGame[] }

const scoreboardUrl = (path: string) => `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`

type Obj = Record<string, unknown>

const obj = (v: unknown): Obj | null => (typeof v === 'object' && v !== null ? (v as Obj) : null)

const int = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseInt(v, 10) : Number.NaN
  return Number.isFinite(n) ? n : 0
}

const parseEvent = (raw: unknown): LeagueGame | null => {
  const event = obj(raw)
  if (!event) return null
  const type = obj(obj(event.status)?.type)
  const state = type?.state
  if (state !== 'pre' && state !== 'in' && state !== 'post') return null
  const competitors = obj(Array.isArray(event.competitions) ? event.competitions[0] : null)?.competitors
  if (!Array.isArray(competitors)) return null
  const side = (homeAway: string) => {
    const c = obj(competitors.find((x) => obj(x)?.homeAway === homeAway))
    const abbr = obj(c?.team)?.abbreviation
    if (!c || typeof abbr !== 'string' || abbr === '') return null
    return { abbr, score: int(c.score) }
  }
  const home = side('home')
  const away = side('away')
  if (!home || !away) return null
  return {
    id: typeof event.id === 'string' ? event.id : `${away.abbr}@${home.abbr}`,
    away,
    home,
    state,
    detail: typeof type?.shortDetail === 'string' ? type.shortDetail : '',
    date: typeof event.date === 'string' ? event.date : '',
  }
}

export const parseScoreboard = (json: unknown): Scoreboard => {
  const root = obj(json)
  const season = obj(root?.season)
  const events = Array.isArray(root?.events) ? root.events : []
  return {
    season: int(season?.year),
    seasonType: int(season?.type),
    week: int(obj(root?.week)?.number),
    games: events.map(parseEvent).filter((g): g is LeagueGame => g !== null),
  }
}

const lastWeekOf = (json: unknown, seasonType: number): number | null => {
  const calendar = obj(json)?.leagues
  const first = Array.isArray(calendar) ? obj(calendar[0])?.calendar : null
  if (!Array.isArray(first)) return null
  const section = first.map(obj).find((c) => c?.value === String(seasonType))
  const entries = section?.entries
  if (!Array.isArray(entries) || entries.length === 0) return null
  const week = int(obj(entries[entries.length - 1])?.value)
  return week > 0 ? week : null
}

const load = async (fetchFn: typeof fetch, path: string, query: string): Promise<unknown> => {
  const res = await fetchFn(`${scoreboardUrl(path)}${query}`)
  if (!res.ok) throw new Error(`scoreboard ${res.status}`)
  return res.json()
}

const previousWeekOf = (currentJson: unknown, current: Scoreboard): { seasonType: number; week: number } | null => {
  if (current.season < 1 || current.week < 1) return null
  if (current.week > 1) return { seasonType: current.seasonType, week: current.week - 1 }
  if (current.seasonType === 2) {
    const week = lastWeekOf(currentJson, 1)
    return week === null ? null : { seasonType: 1, week }
  }
  if (current.seasonType === 3) {
    const week = lastWeekOf(currentJson, 2)
    return week === null ? null : { seasonType: 2, week }
  }
  return null
}

const previousFinals = async (fetchFn: typeof fetch, path: string, currentJson: unknown, current: Scoreboard): Promise<LeagueGame[] | null> => {
  const previous = previousWeekOf(currentJson, current)
  if (!previous) return null
  try {
    const board = parseScoreboard(await load(fetchFn, path, `?seasontype=${previous.seasonType}&week=${previous.week}&dates=${current.season}`))
    return board.games.filter((g) => g.state === 'post')
  } catch {
    return null
  }
}

const time = (g: LeagueGame): number => {
  const t = Date.parse(g.date)
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
}

const RANK = { in: 0, pre: 1, post: 2 }

export const orderGames = (games: LeagueGame[]): LeagueGame[] =>
  games
    .map((g, i) => ({ g, i }))
    .sort((a, b) => RANK[a.g.state] - RANK[b.g.state] || (a.g.state === 'pre' ? time(a.g) - time(b.g) : 0) || a.i - b.i)
    .map((x) => x.g)

export const fetchLeague = async (path: string, fetchFn: typeof fetch = fetch): Promise<LeagueGame[] | null> => {
  try {
    const currentJson = await load(fetchFn, path, '')
    const current = parseScoreboard(currentJson)
    if (current.games.some((g) => g.state !== 'pre')) return orderGames(current.games)
    return await previousFinals(fetchFn, path, currentJson, current)
  } catch {
    return null
  }
}

const standingsUrl = (path: string) => `https://site.api.espn.com/apis/v2/sports/${path}/standings`

export const parseStandings = (json: unknown): Records => {
  const records = new Map<string, string>()
  const conferences = obj(json)?.children
  for (const conference of Array.isArray(conferences) ? conferences : []) {
    const entries = obj(obj(conference)?.standings)?.entries
    for (const entry of Array.isArray(entries) ? entries : []) {
      const abbr = obj(obj(entry)?.team)?.abbreviation
      const stats = obj(entry)?.stats
      const total = Array.isArray(stats) ? stats.map(obj).find((stat) => stat?.type === 'total') : null
      const summary = total?.summary ?? total?.displayValue
      if (typeof abbr === 'string' && abbr !== '' && typeof summary === 'string' && summary !== '') records.set(abbr, summary)
    }
  }
  return records
}

export const fetchStandings = async (path: string, fetchFn: typeof fetch = fetch): Promise<Records | null> => {
  try {
    const res = await fetchFn(standingsUrl(path))
    if (!res.ok) return null
    const records = parseStandings(await res.json())
    return records.size > 0 ? records : null
  } catch {
    return null
  }
}

export function recordOf(records: Records | null, abbr: (espn: string) => string, team: string): string | null {
  for (const [espn, record] of records ?? []) if (abbr(espn) === team) return record
  return null
}
