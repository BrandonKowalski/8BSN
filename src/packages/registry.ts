import tsb from '../../packages/tsb'
import type { BroadcastPackage, RomInfo } from '../sdk/types'
import { EMPTY_PACKAGE } from './empty'

export const PACKAGES: readonly BroadcastPackage[] = [tsb]

export type PackageRom = { rom: RomInfo; pkg: BroadcastPackage }

export type LoadedRom = { bytes: Uint8Array; rom: RomInfo; pkg: BroadcastPackage }

export const romsOf = (packages: readonly BroadcastPackage[]): PackageRom[] => packages.flatMap((pkg) => pkg.roms.map((rom) => ({ rom, pkg })))

export const packageFor = (sha1: string, packages: readonly BroadcastPackage[] = PACKAGES): PackageRom | null =>
  romsOf(packages).find(({ rom }) => rom.sha1 === sha1) ?? null

export const idlePackage = (packages: readonly BroadcastPackage[] = PACKAGES): BroadcastPackage<null, null> => ({
  ...EMPTY_PACKAGE,
  league: packages.length === 1 ? packages[0].league : undefined,
})

export const IDLE_PACKAGE = idlePackage()
