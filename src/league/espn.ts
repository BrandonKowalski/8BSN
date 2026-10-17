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

const lastPreseasonWeek = (json: unknown): number | null => {
  const calendar = obj(json)?.leagues
  const first = Array.isArray(calendar) ? obj(calendar[0])?.calendar : null
  if (!Array.isArray(first)) return null
  const preseason = first.map(obj).find((c) => c?.value === '1')
  const entries = preseason?.entries
  if (!Array.isArray(entries) || entries.length === 0) return null
  const week = int(obj(entries[entries.length - 1])?.value)
  return week > 0 ? week : null
}

const load = async (fetchFn: typeof fetch, query: string): Promise<unknown> => {
  const res = await fetchFn(`${SCOREBOARD_URL}${query}`)
  if (!res.ok) throw new Error(`scoreboard ${res.status}`)
  return res.json()
}

export const fetchLeague = async (fetchFn: typeof fetch = fetch): Promise<LeagueGame[] | null> => {
  try {
    const currentJson = await load(fetchFn, '')
    const current = parseScoreboard(currentJson)
    const started = current.games.filter((g) => g.state !== 'pre')
    if (started.length > 0) return started
    let seasonType = current.seasonType
    let week = current.week - 1
    if (current.seasonType === 2 && current.week === 1) {
      const preseasonWeek = lastPreseasonWeek(currentJson)
      if (preseasonWeek === null) return null
      seasonType = 1
      week = preseasonWeek
    }
    if (week < 1) return null
    const previous = parseScoreboard(await load(fetchFn, `?seasontype=${seasonType}&week=${week}&dates=${current.season}`))
    return previous.games.filter((g) => g.state === 'post')
  } catch {
    return null
  }
}
