/**
 * Import the 83 sitemap-reconciled redirects (CSV-covered section of
 * docs/redirects-audit.md in the website repo). Phase B's sitemap
 * reconciliation discovered 97 URLs from the old WordPress sitemap;
 * 14 already exist on the new site, 83 were CSV-covered via wildcard
 * redirects to `/blog/` or `/about/`.
 *
 * The wildcard targets are usually too coarse — old blog URLs go to
 * /blog/ (the index) when they should go to /blog/<actual-slug>/
 * (the migrated post). This script does that fix at import time:
 *
 *   1. Parse the audit file
 *   2. For each old URL, look up the SLUG in Payload's blog + podcast
 *      collections. If a match exists, use the precise destination.
 *   3. Otherwise fall back to the wildcard target from the audit.
 *
 * Idempotent: skips fromPaths already in Payload's Redirects collection.
 */

import { getPayload } from 'payload'
import { readFile } from 'node:fs/promises'
import config from '../src/payload.config.ts'

const AUDIT_FILE =
  '/Users/nickfischer/Documents/Claude Code/chirobasix-website/docs/redirects-audit.md'

console.log('> Booting Payload (local API mode)…')
const payload = await getPayload({ config })
console.log('> Connected\n')

// ─── Parse audit file ────────────────────────────────────────────────
const raw = await readFile(AUDIT_FILE, 'utf8')
const csvLine = /^- `([^`]+)` -> `([^`]+)` \((\d+)\)$/
interface AuditEntry { fromPath: string; toPath: string; statusCode: string }
const entries: AuditEntry[] = []
let inCsvSection = false
for (const line of raw.split('\n')) {
  if (line.startsWith('## CSV-covered')) { inCsvSection = true; continue }
  if (line.startsWith('## ') && inCsvSection) break
  if (!inCsvSection) continue
  const m = csvLine.exec(line.trim())
  if (m) entries.push({ fromPath: m[1], toPath: m[2], statusCode: m[3] })
}
console.log(`> Parsed ${entries.length} CSV-covered entries from audit\n`)

// ─── Load all blog + podcast slugs from Payload for slug matching ───
const blog = await payload.find({ collection: 'blog', limit: 500, depth: 0 })
const podcast = await payload.find({ collection: 'podcast', limit: 500, depth: 0 })
const blogSlugs = new Set(blog.docs.map((d) => (d as { slug: string }).slug))
const podcastSlugs = new Set(podcast.docs.map((d) => (d as { slug: string }).slug))
console.log(`> Payload knows ${blogSlugs.size} blog slugs + ${podcastSlugs.size} podcast slugs\n`)

// ─── Existing redirects (skip dupes) ─────────────────────────────────
const existing = await payload.find({ collection: 'redirects', limit: 1000, depth: 0 })
const existingFromPaths = new Set(existing.docs.map((d) => (d as { fromPath: string }).fromPath))
console.log(`> Existing Payload redirects: ${existingFromPaths.size}\n`)

// ─── Resolve best destination + import ───────────────────────────────
let created = 0, skipped = 0, upgraded = 0, failed = 0
const note = `Imported from sitemap-audit on ${new Date().toISOString().slice(0, 10)}`

function bestDestination(fromPath: string, fallback: string): { to: string; upgraded: boolean } {
  // Extract the slug from the old URL (last path segment, no trailing slash)
  const slug = fromPath.replace(/^\/|\/$/g, '').split('/').pop() || ''
  if (!slug) return { to: fallback, upgraded: false }
  // Old blog URLs at root-level (e.g. /chiropractor-marketing-guide/) → /blog/<slug>/
  if (!fromPath.startsWith('/blog/') && !fromPath.startsWith('/podcast/') && blogSlugs.has(slug)) {
    return { to: `/blog/${slug}/`, upgraded: true }
  }
  // Old podcast URLs (e.g. /podcast/the-win-win-system/) → /podcast/<slug>/
  if (fromPath.startsWith('/podcast/') && podcastSlugs.has(slug)) {
    return { to: `/podcast/${slug}/`, upgraded: true }
  }
  return { to: fallback, upgraded: false }
}

for (const e of entries) {
  if (existingFromPaths.has(e.fromPath)) { skipped++; continue }
  const { to, upgraded: wasUpgraded } = bestDestination(e.fromPath, e.toPath)
  try {
    await payload.create({
      collection: 'redirects',
      data: { fromPath: e.fromPath, toPath: to, statusCode: e.statusCode, note },
    })
    const arrow = wasUpgraded ? '⤴' : '→'
    process.stdout.write(`  + ${e.fromPath} ${arrow} ${to}${wasUpgraded ? ' (upgraded)' : ''}\n`)
    created++
    if (wasUpgraded) upgraded++
  } catch (err) {
    process.stdout.write(`  ✗ ${e.fromPath}: ${(err as Error).message?.slice(0, 100)}\n`)
    failed++
  }
}

console.log(`\n══ DONE ══`)
console.log(`  created: ${created} (of which ${upgraded} got upgraded destinations)`)
console.log(`  skipped (already exist): ${skipped}`)
console.log(`  failed:  ${failed}`)
process.exit(0)
