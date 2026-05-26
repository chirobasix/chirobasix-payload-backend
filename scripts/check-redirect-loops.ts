/**
 * Audit Payload's Redirects collection for loops. Detects two kinds:
 *
 *   1. Direct self-loops:  A → A   (e.g. /podcast/x/ → /podcast/x/)
 *      These are pure bugs — browsers refuse them and Google sees them
 *      as soft-404s. Always delete.
 *
 *   2. Chain loops:        A → B → A   or   A → B → C → A
 *      A redirect that eventually returns to its origin path. Reports
 *      the cycle but doesn't auto-delete (manual review needed —
 *      could indicate a typo somewhere in the chain).
 *
 * Also flags trailing-slash mismatches that COULD be loops in disguise
 * (e.g. /x → /x/ which a redirect normalizer might bounce back).
 *
 * Run with --fix to auto-delete direct self-loops.
 */
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const FIX = process.argv.includes('--fix')

console.log('> Booting Payload (local API mode)…')
const payload = await getPayload({ config })
console.log('> Connected\n')

const all = await payload.find({ collection: 'redirects', limit: 5000, depth: 0 })
const rows = all.docs as Array<{ id: string; fromPath: string; toPath: string }>
console.log(`> Loaded ${rows.length} redirects\n`)

// Normalize for comparison — treat /x and /x/ as equivalent
const norm = (p: string) => p.replace(/\/+$/, '') || '/'
const map = new Map<string, { id: string; toPath: string; raw: string }>()
for (const r of rows) {
  map.set(norm(r.fromPath), { id: r.id, toPath: r.toPath, raw: r.fromPath })
}

// ── Direct self-loops ──────────────────────────────────────────────
const selfLoops: typeof rows = []
for (const r of rows) {
  if (norm(r.fromPath) === norm(r.toPath)) selfLoops.push(r)
}

console.log(`══ DIRECT SELF-LOOPS (${selfLoops.length}) ══`)
for (const r of selfLoops) {
  console.log(`  ${r.fromPath} → ${r.toPath}`)
}

// ── Chain loops ────────────────────────────────────────────────────
// Walk each fromPath through the redirect map until we hit a non-redirect
// destination OR detect a cycle (revisit a path already in the trail).
const chainLoops: { start: string; chain: string[] }[] = []
for (const r of rows) {
  const trail = [norm(r.fromPath)]
  let current = norm(r.toPath)
  let safety = 50
  while (map.has(current) && safety-- > 0) {
    if (trail.includes(current)) {
      chainLoops.push({ start: r.fromPath, chain: [...trail, current] })
      break
    }
    trail.push(current)
    current = norm(map.get(current)!.toPath)
  }
}

console.log(`\n══ CHAIN LOOPS (${chainLoops.length}) ══`)
for (const c of chainLoops) {
  console.log(`  ${c.start}: ${c.chain.join(' → ')}`)
}

// ── Fix mode ───────────────────────────────────────────────────────
if (FIX && selfLoops.length > 0) {
  console.log(`\n══ DELETING ${selfLoops.length} self-loops ══`)
  for (const r of selfLoops) {
    await payload.delete({ collection: 'redirects', id: r.id })
    console.log(`  ✗ deleted: ${r.fromPath}`)
  }
} else if (selfLoops.length > 0) {
  console.log(`\n  Run with --fix to auto-delete the ${selfLoops.length} self-loops.`)
}

if (chainLoops.length > 0) {
  console.log(`\n  Chain loops need manual review — not auto-fixed.`)
}

console.log(`\nDone.`)
process.exit(0)
