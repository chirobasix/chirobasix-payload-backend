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
let created = 0, skipped = 0, upgraded = 0, failed = 0, skippedSelfLoop = 0
const note = `Imported from sitemap-audit on ${new Date().toISOString().slice(0, 10)}`

/**
 * Returns:
 *   { to, upgraded: true }     — redirect destination is better than the fallback
 *   { to, upgraded: false }    — falling back to the original audit destination
 *   null                       — fromPath is ALREADY a valid URL on the new site
 *                                (a redirect would be a self-loop — skip entirely)
 */
function bestDestination(
  fromPath: string,
  fallback: string,
): { to: string; upgraded: boolean } | null {
  // Extract the slug from the old URL (last path segment, no trailing slash)
  const slug = fromPath.replace(/^\/|\/$/g, '').split('/').pop() || ''
  if (!slug) return { to: fallback, upgraded: false }
  // /podcast/<slug>/ paths: if the slug exists in Payload, the URL is
  // already valid on the new site — NO REDIRECT NEEDED (would be a self-loop).
  if (fromPath.startsWith('/podcast/') && podcastSlugs.has(slug)) {
    return null
  }
  // Same for /blog/<slug>/ paths (defensive — the audit didn't have any
  // at the time, but a future re-run could).
  if (fromPath.startsWith('/blog/') && blogSlugs.has(slug)) {
    return null
  }
  // Old blog URLs at root-level (e.g. /chiropractor-marketing-guide/) → /blog/<slug>/
  if (!fromPath.startsWith('/blog/') && !fromPath.startsWith('/podcast/') && blogSlugs.has(slug)) {
    return { to: `/blog/${slug}/`, upgraded: true }
  }
  return { to: fallback, upgraded: false }
}

for (const e of entries) {
  if (existingFromPaths.has(e.fromPath)) { skipped++; continue }
  const result = bestDestination(e.fromPath, e.toPath)
  if (result === null) {
    process.stdout.write(`  - ${e.fromPath} (already a valid URL on new site — no redirect needed)\n`)
    skippedSelfLoop++
    continue
  }
  const { to, upgraded: wasUpgraded } = result
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
console.log(`  skipped (self-loop avoided): ${skippedSelfLoop}`)
console.log(`  failed:  ${failed}`)
process.exit(0)
