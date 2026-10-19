declare const __BUILD_HASH__: string | undefined

export const BUILD_HASH = typeof __BUILD_HASH__ === 'string' ? __BUILD_HASH__ : 'dev'

export const REPO_URL = 'https://github.com/BrandonKowalski/8BSN'

export const commitUrl = (hash: string) => `${REPO_URL}/commit/${hash}`
