/**
 * Build-time sync: Payload → chirobasix-website's src/content/*.md + public/_redirects.
 *
 * Astro keeps reading from src/content/ via its existing glob loader.
 * This script (run BEFORE `astro build`) ensures those files reflect
 * Payload's current state, so editor saves in Payload show up on the
 * next build with zero page-level code changes.
 *
 * Treats the website's src/content/ AND public/_redirects as build
 * artifacts. They'll be gitignored after Phase F Day 5 cutover.
 *
 * Output per collection:
 *   pages, services, blog, podcast, resources → .md with YAML
 *     frontmatter + body
 *   redirects → public/_redirects (concatenated with the existing
 *     wildcard rules that aren't representable in the Payload schema)
 */

import { getPayload } from 'payload'
import {
  convertLexicalToMarkdown,
  editorConfigFactory,
} from '@payloadcms/richtext-lexical'
import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import config from '../src/payload.config.ts'

const WEBSITE_ROOT = '/Users/nickfischer/Documents/Claude Code/chirobasix-website'
const CONTENT = (sub: string) => join(WEBSITE_ROOT, 'src', 'content', sub)
const REDIRECTS_FILE = join(WEBSITE_ROOT, 'public', '_redirects')

console.log('> Booting Payload (local API mode)…')
const payload = await getPayload({ config })
const editorConfig = await editorConfigFactory.default({ config: payload.config })
console.log('> Connected\n')

/** Convert any value to a YAML scalar/inline value. */
function yamlValue(v: unknown, indent = 0): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') {
    if (/[\n:#"'`*&!|>%@`,\[\]{}]/.test(v) || /^\s|\s$/.test(v)) {
      return JSON.stringify(v)
    }
    return v
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    const pad = ' '.repeat(indent)
    return '\n' + v.map((item) => {
      if (typeof item === 'object' && item !== null) {
        // Strip:
        //  • Payload's internal `id` array-item keys (auto-generated UUID,
        //    Mongo ObjectId, or numeric — distinguishable from intentional
        //    slug-style ids like "anchor-name" written by our mappers)
        //  • undefined / null / empty-string fields (would serialize as
        //    bare keys with no value, which YAML treats as null and Zod
        //    rejects on string-required fields).
        const entries = Object.entries(item).filter(([k, v]) => {
          if (v === undefined || v === null || v === '') return false
          if (k === 'id') {
            if (typeof v === 'number') return false
            // UUID v4 (8-4-4-4-12 hex) OR Mongo ObjectId (24 hex chars)
            if (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}|^[0-9a-f]{24}$/.test(v)) {
              return false
            }
          }
          return true
        })
        return entries
          .map(([k, val], i) => `${pad}${i === 0 ? '- ' : '  '}${k}: ${yamlValue(val, indent + 4)}`)
          .join('\n')
      }
      return `${pad}- ${yamlValue(item)}`
    }).join('\n')
  }
  if (typeof v === 'object') {
    const pad = ' '.repeat(indent)
    return '\n' + Object.entries(v as Record<string, unknown>)
      .filter(([k]) => k !== 'id')
      .map(([k, val]) => `${pad}${k}: ${yamlValue(val, indent + 2)}`)
      .join('\n')
  }
  return ''
}

function buildFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = ['---']
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    lines.push(`${k}: ${yamlValue(v, 2)}`)
  }
  lines.push('---', '')
  return lines.join('\n')
}

/** Extract just the URL string from a Payload upload field (depth=2 expands it). */
function imageUrl(field: unknown): string | undefined {
  if (!field) return undefined
  if (typeof field === 'string') return field
  if (typeof field === 'object' && field !== null) {
    const url = (field as { url?: string }).url
    return url || undefined
  }
  return undefined
}

function bodyMarkdown(body: unknown): string {
  if (!body) return ''
  try {
    return convertLexicalToMarkdown({ data: body as never, editorConfig })
  } catch (e) {
    console.error('    body conversion FAIL:', (e as Error).message?.slice(0, 200))
    return ''
  }
}

/** Wipe + re-populate a content directory. Returns count written. */
async function syncCollection(
  collection: 'pages' | 'services' | 'blog' | 'podcast' | 'resources',
  mapper: (doc: Record<string, unknown>) => { slug: string; frontmatter: Record<string, unknown>; body: string },
): Promise<number> {
  const dir = CONTENT(collection)
  await mkdir(dir, { recursive: true })

  // Clear existing .md files (keep _README.md or any underscore-prefixed)
  const existing = await readdir(dir).catch(() => [])
  for (const f of existing) {
    if ((f.endsWith('.md') || f.endsWith('.mdx')) && !f.startsWith('_')) {
      await unlink(join(dir, f))
    }
  }

  const { docs } = await payload.find({ collection, limit: 500, depth: 2 })
  let count = 0
  for (const doc of docs) {
    const { slug, frontmatter, body } = mapper(doc as Record<string, unknown>)
    const md = buildFrontmatter(frontmatter) + body + (body.endsWith('\n') ? '' : '\n')
    await writeFile(join(dir, `${slug}.md`), md)
    count++
  }
  console.log(`> ${collection}: ${count} written`)
  return count
}

// ─── Mappers (Payload doc → frontmatter + body) ────────────────────

function mapPage(d: Record<string, unknown>) {
  return {
    slug: d.slug as string,
    frontmatter: {
      title: d.title,
      description: d.description,
      ogImage: imageUrl(d.ogImage),
    },
    body: bodyMarkdown(d.body),
  }
}

function mapService(d: Record<string, unknown>) {
  return {
    slug: d.slug as string,
    frontmatter: {
      title: d.title,
      subtitle: d.subtitle,
      eyebrow: d.eyebrow,
      description: d.description,
      heroImage: imageUrl(d.heroImage),
      cta: d.cta,
      publishDate: d.publishDate,
      ogImage: imageUrl(d.ogImage),
    },
    body: bodyMarkdown(d.body),
  }
}

function mapBlog(d: Record<string, unknown>) {
  return {
    slug: d.slug as string,
    frontmatter: {
      title: d.title,
      description: d.description,
      publishDate: d.publishDate,
      updateDate: d.updateDate,
      author: d.author,
      category: d.category,
      heroImage: imageUrl(d.heroImage),
      heroImageAlt: d.heroImageAlt,
      excerpt: d.excerpt,
      readingTimeMinutes: d.readingTimeMinutes,
      tags: (d.tags as Array<{ tag: string }> | undefined)?.map((t) => t.tag),
      // Map `anchor` back to `id` for the Astro schema (which expects { id, label })
      tocAnchors: (d.tocAnchors as Array<{ anchor: string; label: string }> | undefined)?.map((a) => ({
        id: a.anchor,
        label: a.label,
      })),
      ogImage: imageUrl(d.ogImage),
    },
    body: bodyMarkdown(d.body),
  }
}

function mapPodcast(d: Record<string, unknown>) {
  return {
    slug: d.slug as string,
    frontmatter: {
      title: d.title,
      description: d.description,
      episodeNumber: d.episodeNumber,
      seasonNumber: d.seasonNumber,
      category: d.category,
      publishDate: d.publishDate,
      audioEmbedHtml: d.audioEmbedHtml,
      audioUrl: d.audioUrl,
      durationLabel: d.durationLabel,
      durationMinutes: d.durationMinutes,
      videoEmbedUrl: d.videoEmbedUrl,
      youtubeId: d.youtubeId,
      hosts: (d.hosts as Array<{ name: string }> | undefined)?.map((h) => h.name),
      guests: (d.guests as Array<{ name: string }> | undefined)?.map((g) => g.name),
      chapters: d.chapters,
      linksMentioned: d.linksMentioned,
      transcript: d.transcript,
      tags: (d.tags as Array<{ tag: string }> | undefined)?.map((t) => t.tag),
      showNotes: d.showNotes,
      heroImage: imageUrl(d.heroImage),
      ogImage: imageUrl(d.ogImage),
    },
    body: bodyMarkdown(d.body),
  }
}

function mapResource(d: Record<string, unknown>) {
  return {
    slug: d.slug as string,
    frontmatter: {
      title: d.title,
      description: d.description,
      leadMagnetType: d.leadMagnetType,
      heroImage: imageUrl(d.heroImage),
      formFields: d.formFields,
      postSubmitRedirect: d.postSubmitRedirect,
      ogImage: imageUrl(d.ogImage),
    },
    body: bodyMarkdown(d.body),
  }
}

// ─── Sync redirects → public/_redirects ────────────────────────────

const REDIRECTS_HEADER = `# AUTO-GENERATED by chirobasix-payload-backend/scripts/sync-to-website.ts
# DO NOT EDIT BY HAND — edits will be wiped on next sync. Manage redirects
# at https://admin.chirobasix.com/admin/collections/redirects
#
# Wildcards (not representable in Payload's exact-match schema) are
# preserved below the generated section.

`

// Wildcards that stay as static rules — Payload's Redirects collection
// is keyed on exact fromPath, so these live here until we add a pattern
// field to the schema (Phase F Day 4).
const WILDCARDS = `# ─── Wildcards (static) ─────────────────────────────────────────────
/marketing-journal/*   /blog/:splat   301
/portfolio/*           /about/        301
/case-studies/*        /about/        301
/work/*                /about/        301

# ─── Sitemap aliases ────────────────────────────────────────────────
/sitemap_index.xml     /sitemap-index.xml   301
`

async function syncRedirects(): Promise<number> {
  const { docs } = await payload.find({ collection: 'redirects', limit: 5000, depth: 0 })
  // Sort by fromPath length DESC so longer/more-specific paths win over shorter
  // ones if there's any prefix overlap (CF Pages picks the first match).
  const sorted = docs
    .map((d) => d as { fromPath: string; toPath: string; statusCode: string | number })
    .sort((a, b) => b.fromPath.length - a.fromPath.length)

  const lines = sorted.map(
    (r) => `${r.fromPath}   ${r.toPath}   ${r.statusCode || 301}`,
  )

  const content = REDIRECTS_HEADER +
    '# ─── Payload-managed (exact-match) ──────────────────────────────────\n' +
    lines.join('\n') + '\n\n' +
    WILDCARDS

  await writeFile(REDIRECTS_FILE, content)
  console.log(`> redirects: ${lines.length} Payload-managed + 5 wildcards`)
  return lines.length
}

// ─── Run ───────────────────────────────────────────────────────────
console.log('══ SYNCING ══')
await syncCollection('pages', mapPage)
await syncCollection('services', mapService)
await syncCollection('blog', mapBlog)
await syncCollection('podcast', mapPodcast)
await syncCollection('resources', mapResource)
await syncRedirects()
console.log('\n══ DONE ══')
process.exit(0)
