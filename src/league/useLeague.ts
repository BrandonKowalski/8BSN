import { useEffect, useState } from 'react'
import { fetchLeague, type LeagueGame } from './espn'

const LIVE_MS = 60_000
const IDLE_MS = 900_000

export const useLeague = (): LeagueGame[] | null => {
  const [games, setGames] = useState<LeagueGame[] | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let last: LeagueGame[] | null = null

    const tick = async () => {
      const next = await fetchLeague()
      if (cancelled) return
      if (next) {
        last = next
        setGames(next)
      }
      timer = setTimeout(tick, last?.some((g) => g.state === 'in') ? LIVE_MS : IDLE_MS)
    }

    void tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return games
}
