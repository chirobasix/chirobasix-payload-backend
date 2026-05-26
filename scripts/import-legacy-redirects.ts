/**
 * One-shot import of the static public/_redirects file (WordPress
 * migration era) into Payload's Redirects collection.
 *
 * Source:  /Users/nickfischer/Documents/Claude Code/chirobasix-website/public/_redirects
 * Format:  whitespace-separated `<fromPath> <toPath> <statusCode>` per line
 *          (comments + blank lines ignored).
 *
 * Scope: LITERAL paths only. Wildcard rules (containing `*` in fromPath)
 * are NOT imported — Payload's Redirects schema is keyed on exact
 * fromPath. Wildcards stay in public/_redirects until we extend the
 * schema with a `pattern` field. The unhandled wildcards are logged
 * at the end so we know what we kept where.
 *
 * Idempotent: if a fromPath already exists in Payload (e.g. you ran
 * this twice), it's skipped — not overwritten — so any manual edits
 * via the admin survive a re-run.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   npx tsx scripts/import-legacy-redirects.ts
 */

import { getPayload } from 'payload'
import { readFile } from 'node:fs/promises'
import config from '../src/payload.config.ts'

const REDIRECTS_FILE =
  '/Users/nickfischer/Documents/Claude Code/chirobasix-website/public/_redirects'

console.log('> Booting Payload (local API mode)…')
const payload = await getPayload({ config })
console.log('> Connected\n')

const raw = await readFile(REDIRECTS_FILE, 'utf8')
const lines = raw.split('\n')

interface Parsed {
  fromPath: string
  toPath: string
  statusCode: string
  lineNumber: number
}
const literals: Parsed[] = []
const wildcards: Parsed[] = []

lines.forEach((line, i) => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return
  // CF Pages _redirects format: whitespace-separated columns
  const parts = trimmed.split(/\s+/)
  if (parts.length < 2) return
  const [fromPath, toPath, statusCode = '301'] = parts
  const entry = { fromPath, toPath, statusCode, lineNumber: i + 1 }
  if (fromPath.includes('*') || toPath.includes(':splat')) {
    wildcards.push(entry)
  } else {
    literals.push(entry)
  }
})

console.log(`> Found ${literals.length} literal redirects + ${wildcards.length} wildcards (skipped)`)

// Get existing fromPaths so we don't double-create
const existing = await payload.find({
  collection: 'redirects',
  limit: 1000,
  depth: 0,
})
const existingFromPaths = new Set(
  existing.docs.map((d) => (d as { fromPath: string }).fromPath),
)
console.log(`> Existing Payload redirects: ${existingFromPaths.size}\n`)

let created = 0
let skipped = 0
let failed = 0
const note = `Imported from public/_redirects on ${new Date().toISOString().slice(0, 10)}`

for (const r of literals) {
  if (existingFromPaths.has(r.fromPath)) {
    skipped++
    continue
  }
  try {
    await payload.create({
      collection: 'redirects',
      data: {
        fromPath: r.fromPath,
        toPath: r.toPath,
        statusCode: r.statusCode,
        note,
      },
    })
    process.stdout.write(`  + ${r.fromPath} → ${r.toPath} (${r.statusCode})\n`)
    created++
  } catch (err) {
    process.stdout.write(`  ✗ ${r.fromPath}: ${(err as Error).message?.slice(0, 100)}\n`)
    failed++
  }
}

console.log(`\n══ DONE ══`)
console.log(`  created: ${created}`)
console.log(`  skipped (already exist): ${skipped}`)
console.log(`  failed:  ${failed}`)
console.log(`\n  ${wildcards.length} wildcard rules NOT imported — kept in public/_redirects:`)
wildcards.forEach((w) => console.log(`    L${w.lineNumber}: ${w.fromPath} → ${w.toPath}`))
process.exit(0)
