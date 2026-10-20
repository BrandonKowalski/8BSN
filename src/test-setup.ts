import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'
import { expect } from 'vitest'

const STRICT_PATHS = ['/src/broadcast/', '/packages/tsb/broadcast/']
const testPath = expect.getState().testPath ?? ''

configure({ reactStrictMode: STRICT_PATHS.some((path) => testPath.includes(path)) })
