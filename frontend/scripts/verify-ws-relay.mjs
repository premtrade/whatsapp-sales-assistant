#!/usr/bin/env node
/**
 * Local verification for the WebSocket relay in frontend/api/ws.ts.
 *
 * It compiles api/ws.ts with the repository's own TypeScript and drives the real
 * `bridge()` + `resolveUpstreamUrl()` against a mimic of the Fastify WebSocket server,
 * asserting the wire contract:
 *
 *   1. the browser's `?token=` is forwarded to the upstream socket  (auth_success)
 *   2. upstream events reach the browser                             (new_message x2)
 *   3. browser frames reach upstream                                 (ping -> pong)
 *   4. close codes are forwarded                                     (4001 on bad token)
 *
 * The only thing it cannot cover is `experimental_upgradeWebSocket`, which needs the
 * Vercel runtime (it throws elsewhere). Everything else is the production code path,
 * so use the deployed `wss://waflo.vercel.app/ws` for the final end-to-end check.
 *
 * Usage:  npm run verify:ws        (from frontend/)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import http from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(here, '..')
const cacheDir = path.join(frontendDir, 'node_modules', '.cache', 'waflo-relay-verify')

const VALID_TOKEN = 'local-harness-token'

/** Transpile api/ws.ts to ESM that Node can import (keeps the repo's Node >= 20 support). */
async function loadRelay() {
  const ts = require('typescript')
  const source = readFileSync(path.join(frontendDir, 'api', 'ws.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    fileName: 'ws.ts',
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })

  // The Vercel-only upgrade helper is not importable outside the Vercel runtime (the
  // package is CJS-in-ESM and only the platform implements it), so stub it out for the
  // local run. bridge()/resolveUpstreamUrl() below are the untouched production code.
  const shimmed = outputText.replace(
    /import \{[^}]*experimental_upgradeWebSocket[^}]*\} from '@vercel\/functions';?/,
    "const experimental_upgradeWebSocket = () => { throw new Error('vercel-runtime-only'); };"
  )
  if (shimmed === outputText) {
    throw new Error('Could not shim the @vercel/functions import - has api/ws.ts changed?')
  }

  mkdirSync(cacheDir, { recursive: true })
  const compiled = path.join(cacheDir, 'ws.mjs')
  writeFileSync(compiled, shimmed, 'utf8')
  return import(pathToFileURL(compiled).href)
}

/** Mimics backend/src/websocketServer.ts: token auth, ping/pong, tenant events. */
function startUpstream() {
  const server = http.createServer((_req, res) => {
    res.writeHead(404).end()
  })
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url, 'http://localhost')
    const token = url.searchParams.get('token')
    let authenticated = false
    let ticker = null

    if (token === VALID_TOKEN) {
      authenticated = true
      socket.send(JSON.stringify({ type: 'auth_success', payload: { message: 'Authenticated successfully' } }))
      let n = 0
      ticker = setInterval(() => {
        n += 1
        socket.send(JSON.stringify({ type: 'new_message', payload: { seq: n }, timestamp: new Date().toISOString() }))
      }, 150)
    }

    socket.on('message', (raw) => {
      let message
      try {
        message = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (message.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }))
      }
    })

    socket.on('close', () => {
      if (ticker) clearInterval(ticker)
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        url: `ws://127.0.0.1:${port}/ws`,
        close: () =>
          new Promise((done) => {
            wss.clients.forEach((c) => c.terminate())
            server.close(() => done())
          }),
        // Rejected credentials: auth_error then 4001 (mirrors the auth timeout/failure paths).
        rejectUnauthenticated: () => {
          wss.clients.forEach((c) => {
            c.send(JSON.stringify({ type: 'auth_error', payload: { message: 'Invalid token' } }))
            c.close(4001, 'Unauthorized')
          })
        },
      })
    })
  })
}


/** Minimal stand-in for handleRequest(): upgrade, then hand both sockets to bridge(). */
function startRelay(relay, upstreamBase) {
  const server = http.createServer((_req, res) => {
    res.writeHead(426, { 'content-type': 'application/json' }).end('{"success":false}')
  })
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (client) => {
      let upstream
      try {
        upstream = new WebSocket(relay.resolveUpstreamUrl(`https://relay.local${req.url}`, upstreamBase))
      } catch (error) {
        client.close(1011, 'upstream resolution failed')
        return
      }
      upstream.once('error', () => {
        try { client.close(1011, 'upstream error') } catch {}
      })
      relay.bridge(client, upstream).catch(() => {})
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        close: () =>
          new Promise((done) => {
            wss.clients.forEach((c) => c.terminate())
            server.close(() => done())
          }),
      })
    })
  })
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const frames = []
    let closed = null
    ws.on('message', (raw) => {
      try {
        frames.push(JSON.parse(raw.toString()))
      } catch {
        /* ignore */
      }
    })
    ws.on('close', (code) => {
      closed = code
    })
    ws.on('open', () => resolve({ ws, frames, closeCode: () => closed }))
    ws.on('error', reject)
  })
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await wait(50)
  }
  return predicate()
}

const checks = []
function check(name, ok, detail = '') {
  checks.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

async function main() {
  const upstream = await startUpstream()
  const relay = await loadRelay()
  const server = await startRelay(relay, upstream.url)
  console.log(`upstream ${upstream.url}  ->  relay ws://127.0.0.1:${server.port}/ws\n`)

  try {
    // 1-3: happy path through the real bridge()
    const client = await connect(`ws://127.0.0.1:${server.port}/ws?token=${VALID_TOKEN}`)

    const sawAuth = await waitFor(() => client.frames.some((f) => f.type === 'auth_success'))
    check('forwards ?token= to the upstream socket', sawAuth)

    const sawEvents = await waitFor(
      () => client.frames.filter((f) => f.type === 'new_message').length >= 2,
      3000
    )
    check('pipes upstream events to the browser', sawEvents,
      `${client.frames.filter((f) => f.type === 'new_message').length} events`)

    client.ws.send(JSON.stringify({ type: 'ping' }))
    const sawPong = await waitFor(() => client.frames.some((f) => f.type === 'pong'))
    check('pipes browser frames upstream (ping -> pong)', sawPong)

    client.ws.close(1000, 'done')
    await wait(100)

    // 4: rejected credentials must reach the browser with the original close code
    const rejected = await connect(`ws://127.0.0.1:${server.port}/ws?token=not-a-real-token`)
    await wait(150)
    upstream.rejectUnauthenticated()
    const sawAuthError = await waitFor(() => rejected.frames.some((f) => f.type === 'auth_error'))
    const closedWith4001 = await waitFor(() => rejected.closeCode() === 4001, 3000)
    check('forwards upstream auth_error to the browser', sawAuthError)
    check('forwards close code 4001 so the client re-logs in', closedWith4001,
      `code=${rejected.closeCode()}`)
  } finally {
    await server.close()
    await upstream.close()
    rmSync(cacheDir, { recursive: true, force: true })
  }

  const failed = checks.filter((ok) => !ok).length
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
  return failed === 0 ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('verify-ws-relay failed:', error)
    process.exit(1)
  })
