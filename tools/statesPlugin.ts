import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'

const ROUTE = '/__states/'
const NAME = /^[\w-]+\.(state|json)$/

function body(req: IncomingMessage): Promise<Buffer> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => done(Buffer.concat(chunks)))
    req.on('error', fail)
  })
}

export function statesPlugin(dir = resolve('states')): Plugin {
  return {
    name: 'tb-states',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(ROUTE)) return next()
        const name = decodeURIComponent(req.url.slice(ROUTE.length).split('?')[0])
        if (!NAME.test(name)) {
          res.statusCode = 400
          return res.end()
        }
        const path = join(dir, name)
        if (req.method === 'PUT') {
          mkdirSync(dir, { recursive: true })
          writeFileSync(path, await body(req))
          res.statusCode = 204
          return res.end()
        }
        if (req.method === 'GET') {
          if (!existsSync(path)) {
            res.statusCode = 404
            return res.end()
          }
          res.setHeader('Content-Type', name.endsWith('.json') ? 'application/json' : 'application/octet-stream')
          res.setHeader('Cache-Control', 'no-store')
          return res.end(readFileSync(path))
        }
        res.statusCode = 405
        res.end()
      })
    },
  }
}
