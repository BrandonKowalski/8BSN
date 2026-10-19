import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'
import { expect } from 'vitest'

configure({ reactStrictMode: expect.getState().testPath?.includes('/src/views/broadcast/') ?? false })
