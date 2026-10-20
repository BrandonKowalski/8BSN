import { TSB_LEAGUE } from '../game/league'
import { TSB_ANCHOR } from '../game/maps/tsb2026'
import { TSB_ROMS } from '../game/roms'
import { useTsbSession, type TsbView } from '../game/session'
import { tsbTailgate } from '../game/tailgate'
import type { GameSidecar } from '../game/useGame'
import type { BroadcastPackage, RomInfo } from '../sdk/types'
import { tsbSlots } from '../views/broadcast/slots'

const tsb: BroadcastPackage<TsbView, GameSidecar> = {
  id: 'tsb',
  name: 'Tecmo Super Bowl',
  contract: 1,
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

export const PACKAGES: readonly BroadcastPackage[] = [tsb]

export type PackageRom = { rom: RomInfo; pkg: BroadcastPackage }

export type LoadedRom = { bytes: Uint8Array; rom: RomInfo; pkg: BroadcastPackage }

export const romsOf = (packages: readonly BroadcastPackage[]): PackageRom[] => packages.flatMap((pkg) => pkg.roms.map((rom) => ({ rom, pkg })))

export const packageFor = (sha1: string, packages: readonly BroadcastPackage[] = PACKAGES): PackageRom | null =>
  romsOf(packages).find(({ rom }) => rom.sha1 === sha1) ?? null
