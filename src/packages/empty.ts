import type { BroadcastPackage } from '../sdk/types'

export const EMPTY_PACKAGE: BroadcastPackage<null, null> = {
  id: 'none',
  name: '',
  contract: 1,
  roms: [],
  useSession: () => ({ data: null, phase: 'menus', generation: 0, save: () => null, restore() {}, suspend() {}, resume() {} }),
  slots: {},
}
