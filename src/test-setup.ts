import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'
import { expect } from 'vitest'

const STRICT_PATH = /\/(src|packages\/[^/]+)\/broadcast\//
const testPath = expect.getState().testPath ?? ''

configure({ reactStrictMode: STRICT_PATH.test(testPath) })
