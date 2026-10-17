export type TeamColor = { primary: string; secondary: string }

const FALLBACK: TeamColor = { primary: '#333', secondary: '#999' }

const c = (primary: string, secondary: string): TeamColor => ({ primary, secondary })

const ARIZONA = c('#97233f', '#ffb612')
const LOS_ANGELES_RAMS = c('#003594', '#ffa300')
const WASHINGTON = c('#5a1414', '#ffb612')
const JACKSONVILLE = c('#006778', '#d7a22a')

export const teamColors: Record<string, TeamColor> = {
  ARZ: ARIZONA,
  ARI: ARIZONA,
  ATL: c('#a71930', '#000000'),
  BAL: c('#241773', '#9e7c0c'),
  BUF: c('#00338d', '#c60c30'),
  CAR: c('#0085ca', '#101820'),
  CHI: c('#0b162a', '#c83803'),
  CIN: c('#fb4f14', '#000000'),
  CLE: c('#311d00', '#ff3c00'),
  DAL: c('#003594', '#869397'),
  DEN: c('#fb4f14', '#002244'),
  DET: c('#0076b6', '#b0b7bc'),
  GB: c('#203731', '#ffb612'),
  HOU: c('#03202f', '#a71930'),
  IND: c('#002c5f', '#a2aaad'),
  JAX: JACKSONVILLE,
  JAC: JACKSONVILLE,
  KC: c('#e31837', '#ffb81c'),
  LV: c('#000000', '#a5acaf'),
  LAC: c('#0080c6', '#ffc20e'),
  LAR: LOS_ANGELES_RAMS,
  LA: LOS_ANGELES_RAMS,
  MIA: c('#008e97', '#fc4c02'),
  MIN: c('#4f2683', '#ffc62f'),
  NE: c('#002244', '#c60c30'),
  NO: c('#101820', '#d3bc8d'),
  NYG: c('#0b2265', '#a71930'),
  NYJ: c('#125740', '#ffffff'),
  PHI: c('#004c54', '#a5acad'),
  PIT: c('#101820', '#ffb612'),
  SF: c('#aa0000', '#b3995d'),
  SEA: c('#002244', '#69be28'),
  TB: c('#d50a0a', '#34302b'),
  TEN: c('#0c2340', '#4b92db'),
  WAS: WASHINGTON,
  WSH: WASHINGTON,
}

export const teamColor = (abbr: string): TeamColor => teamColors[abbr] ?? FALLBACK
