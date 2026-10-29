#!/usr/bin/env node
// Keep the report-only CSP's script hashes in step with the pages nginx serves
// (system_3 #9106).
//
// default.conf's $csp_report_only policy allows inline scripts by their sha256
// only: index.html's pre-paint theme setter (#4245) and the birthday
// invitation page's video script (#2846). Vite copies both into dist/ byte for
// byte, so the hash of the source is the hash the browser computes. Editing a
// script without updating the policy would make the console report it on
// every load; once the policy enforces, that script would stop running.
//
// Fails (exit 1) when:
//   1. a page's inline <script> has no matching 'sha256-…' in the policy,
//      and/or
//   2. the policy carries a 'sha256-…' that matches no inline script (stale).
//
// With no root it checks the sources: index.html and every page under public/.
// Dockerfile-Client runs it on the built dist/, so the image build (and with it
// build-image.yml) fails on a drifted hash. Runnable locally:
// `npm run guard:csp-hashes`.
//
// usage: node scripts/check-csp-hashes.mjs [served-root] [default.conf]
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const [root, confPath = 'default.conf'] = process.argv.slice(2)

const htmlUnder = (dir) =>
  readdirSync(dir, { recursive: true })
    .filter((f) => f.endsWith('.html'))
    .map((f) => join(dir, f))
const pages = root ? htmlUnder(root) : ['index.html', ...htmlUnder('public')]

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

// hash -> the pages whose inline script has it
const want = new Map()
for (const page of pages) {
  const html = readFileSync(page, 'utf8')
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const hash = `sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}`
    want.set(hash, [...(want.get(hash) ?? []), page])
  }
}

const conf = readFileSync(confPath, 'utf8')
const block = conf.match(/map \$request_uri \$csp_report_only \{([\s\S]*?)\n\}/)
if (!block) fail(`ERROR: no \`map $request_uri $csp_report_only\` block in ${confPath}`)
const policy = block[1].match(/^\s*default\s+"([^"]*)";/m)
if (!policy) fail(`ERROR: the $csp_report_only map in ${confPath} has no default policy`)
const have = new Set([...policy[1].matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]))

const errors = [
  ...[...want].filter(([h]) => !have.has(h)).map(
    ([h, where]) => `ERROR: ${where.join(', ')} has an inline script hashing to '${h}', which the report-only policy in ${confPath} does not allow`,
  ),
  ...[...have].filter((h) => !want.has(h)).map(
    (h) => `ERROR: the report-only policy in ${confPath} allows '${h}', which matches no inline script in the ${pages.length} page(s) checked (stale)`,
  ),
]
if (errors.length) {
  fail([...errors, "CSP hash guard FAILED: update the hashes in default.conf's $csp_report_only map."].join('\n'))
}
console.log(`CSP hash guard: OK (${pages.length} page(s), ${want.size} inline script(s), all hashed in the report-only policy).`)
