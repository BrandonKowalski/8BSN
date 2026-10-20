import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { GameState, TeamState } from '../game/types'
import type { Helmets } from '../helmets/useHelmets'
import { recordOf, type LeagueData } from '@8bsn/sdk'
import { teamColor } from './teamColors'

export const CLASH_MIN_MS = 2500
export const CLASH_CAP_MS = 12000
export const CLASH_FADE_MS = 800

type Clash = { teams: [TeamState, TeamState]; at: number }

export function useClash(state: GameState | null, generation: number): { clash: Clash | null; leaving: boolean } {
  const [clash, setClash] = useState<Clash | null>(null)
  const [leaving, setLeaving] = useState(false)
  const seen = useRef<{ intro: GameState['intro']; generation: number }>({ intro: null, generation })
  const intro = state?.intro ?? null
  const teams = state?.teams
  useEffect(() => {
    const fresh = seen.current.generation !== generation
    const rose = intro === 'card' && seen.current.intro !== 'card'
    seen.current = { intro, generation }
    if (fresh || !rose || !teams) return
    setLeaving(false)
    setClash({ teams, at: Date.now() })
  }, [intro, generation, teams])
  const over = intro === 'coinToss'
  useEffect(() => {
    if (!clash || leaving) return
    const shown = Date.now() - clash.at
    const wait = over ? CLASH_MIN_MS - shown : CLASH_CAP_MS - shown
    const timer = setTimeout(() => setLeaving(true), Math.max(0, wait))
    return () => clearTimeout(timer)
  }, [clash, leaving, over])
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => {
      setClash(null)
      setLeaving(false)
    }, CLASH_FADE_MS)
    return () => clearTimeout(timer)
  }, [leaving])
  return { clash, leaving }
}

type Props = { state: GameState | null; helmets: Helmets; generation: number; league: LeagueData }

export default function HelmetClash({ state, helmets, generation, league }: Props) {
  const { clash, leaving } = useClash(state, generation)
  if (!clash) return null
  const colors = clash.teams.map((team) => teamColor(team.abbr))
  const style = {
    '--clash-primary-0': colors[0].primary,
    '--clash-secondary-0': colors[0].secondary,
    '--clash-primary-1': colors[1].primary,
    '--clash-secondary-1': colors[1].secondary,
  } as CSSProperties
  return (
    <div className={leaving ? 'helmet-clash clash-leaving' : 'helmet-clash'} data-testid="helmet-clash" key={clash.at} style={style}>
      <div className="clash-shake">
        {clash.teams.map((team, side) => (
          <div className={`clash-half clash-half-${side}`} key={side}>
            <span className="clash-plate" />
            <div className="clash-side">
              <div className="clash-hit">
                {helmets.get(team.id) ? (
                  <img className="clash-helmet" data-testid="clash-helmet" src={helmets.get(team.id)} alt="" />
                ) : (
                  <span className="clash-helmet clash-helmet-text">{team.abbr}</span>
                )}
              </div>
              <div className="clash-team" data-testid="clash-team">
                <span className="clash-city">{team.city || team.abbr}</span>
                <span className="clash-name">{team.name}</span>
                {recordOf(league.records, league.toRom, team.abbr) && (
                  <span className="clash-record" data-testid="clash-record">
                    {recordOf(league.records, league.toRom, team.abbr)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        <span className="clash-spark" />
        <span className="clash-flash" />
      </div>
    </div>
  )
}
