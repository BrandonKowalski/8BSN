import type { BroadcastPackage } from '@8bsn/sdk'
import { tsbSlots } from './broadcast/slots'
import { TSB_LEAGUE } from './game/league'
import { TSB_ANCHOR } from './game/maps/tsb2026'
import { TSB_ROMS } from './game/roms'
import { useTsbSession, type TsbView } from './game/session'
import { tsbTailgate } from './game/tailgate'
import type { GameSidecar } from './game/useGame'

const tsb: BroadcastPackage<TsbView, GameSidecar> = {
  id: 'tsb',
  name: 'Tecmo Super Bowl',
  contract: 1,
  version: '1.0.0',
  author: '8BSN',
  about: [
    { label: 'ABOUT', value: 'Scorebug, drive cards, telestrated route replays, stat breaks and the helmet clash for Tecmo Super Bowl' },
    { label: 'LEAGUE', value: 'NFL scores from ESPN' },
  ],
  roms: TSB_ROMS,
  credits: [
    { what: 'Game', who: 'Tecmo Super Bowl by Tecmo, 1991' },
    { what: 'ROM Hacking', who: 'Knobbe, bruddog, SBlueman and the other legends on tecmobowl.org' },
  ],
  owners: ['Tecmo', 'the NFL', 'the NFLPA'],
  league: TSB_LEAGUE,
  clipAnchor: TSB_ANCHOR,
  tailgate: tsbTailgate,
  useSession: useTsbSession,
  slots: tsbSlots,
}

export default tsb
