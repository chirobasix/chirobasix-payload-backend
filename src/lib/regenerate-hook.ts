/**
 * Shared Payload `afterChange` hook — fires the regenerate endpoint
 * after any save in a content collection. Fire-and-forget so editor
 * saves don't wait for the rebuild.
 *
 * The endpoint pulls the latest content from Payload, generates the
 * markdown + redirects files, and commits to chirobasix-website via
 * the GitHub Contents API. CF Pages auto-deploys from the commit.
 *
 * Add to any collection like:
 *   hooks: { afterChange: [triggerRegenerate] }
 *
 * Set REGENERATE_TOKEN on Vercel env (any random string ≥32 chars).
 */

import type { CollectionAfterChangeHook } from 'payload'

const REGENERATE_TOKEN = process.env.REGENERATE_TOKEN || ''

/** Determine the backend's own URL. Vercel sets VERCEL_URL; otherwise
 *  fall back to PAYLOAD_PUBLIC_URL (set when admin.chirobasix.com is live). */
function getSelfUrl(): string {
  if (process.env.PAYLOAD_PUBLIC_URL) return process.env.PAYLOAD_PUBLIC_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export const triggerRegenerate: CollectionAfterChangeHook = async ({ collection, doc, operation }) => {
  if (!REGENERATE_TOKEN) {
    console.warn('[regenerate-hook] REGENERATE_TOKEN not set — skipping')
    return doc
  }

  const url = `${getSelfUrl()}/api/regenerate`
  const slug = (doc as { slug?: string }).slug || (doc as { id?: string | number }).id
  console.log(`[regenerate-hook] ${operation} on ${collection.slug}:${slug} → POST ${url}`)

  // Fire-and-forget — don't make the editor wait. Errors logged but
  // don't propagate (a failed rebuild trigger shouldn't fail the save).
  fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REGENERATE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trigger: { collection: collection.slug, operation, slug } }),
  })
    .then(async (res) => {
      const body = await res.text().then((t) => t.slice(0, 500))
      if (res.ok) {
        console.log(`[regenerate-hook] regenerate OK: ${body}`)
      } else {
        console.error(`[regenerate-hook] regenerate FAILED ${res.status}: ${body}`)
      }
    })
    .catch((e) => {
      console.error(`[regenerate-hook] fetch threw:`, e)
    })

  return doc
}
