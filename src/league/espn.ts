export type LeagueGame = {
  id: string
  away: { abbr: string; score: number }
  home: { abbr: string; score: number }
  state: 'pre' | 'in' | 'post'
  detail: string
}

type Scoreboard = { season: number; seasonType: number; week: number; games: LeagueGame[] }

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'

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

const load = async (fetchFn: typeof fetch, query: string): Promise<unknown> => {
  const res = await fetchFn(`${SCOREBOARD_URL}${query}`)
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

const previousFinals = async (fetchFn: typeof fetch, currentJson: unknown, current: Scoreboard): Promise<LeagueGame[] | null> => {
  const previous = previousWeekOf(currentJson, current)
  if (!previous) return null
  try {
    const board = parseScoreboard(await load(fetchFn, `?seasontype=${previous.seasonType}&week=${previous.week}&dates=${current.season}`))
    return board.games.filter((g) => g.state === 'post')
  } catch {
    return null
  }
}

export const fetchLeague = async (fetchFn: typeof fetch = fetch): Promise<LeagueGame[] | null> => {
  try {
    const currentJson = await load(fetchFn, '')
    const current = parseScoreboard(currentJson)
    const started = current.games.filter((g) => g.state !== 'pre')
    if (started.some((g) => g.state === 'in')) return started
    const earlier = await previousFinals(fetchFn, currentJson, current)
    if (started.length === 0) return earlier
    return [...started, ...(earlier ?? [])]
  } catch {
    return null
  }
}
