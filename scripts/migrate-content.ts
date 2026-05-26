/**
 * Phase F Day 2 — one-shot migration of chirobasix-website's
 * src/content/ markdown into the Payload backend.
 *
 * Reads from: /Users/nickfischer/Documents/Claude Code/chirobasix-website/src/content/
 * Writes to: this backend's Postgres via Payload's local API (no HTTP roundtrip,
 * no auth — runs inside the same Node process as Payload).
 *
 * Order matters: media first (upload referenced images), then pages/services/
 * resources (no inter-collection refs), then blog + podcast (which reference
 * media for heroImage/ogImage).
 *
 * Body field strategy: convert markdown → Lexical JSON via
 * convertMarkdownToLexical. Lossy on edge cases (HTML embeds, custom
 * shortcodes), but produces a real editable rich-text doc. Anything that
 * doesn't convert cleanly will surface as a per-document log line for
 * manual review.
 *
 * Idempotent: deletes existing docs for each collection before re-inserting,
 * so re-running is safe. Run with `npm run migrate-content`.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   npx tsx scripts/migrate-content.ts
 */

import { getPayload } from 'payload'
import {
  convertMarkdownToLexical,
  editorConfigFactory,
} from '@payloadcms/richtext-lexical'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'
import matter from 'gray-matter'
import config from '../src/payload.config.ts'

// ─── Paths ──────────────────────────────────────────────────────────
const WEBSITE_ROOT = '/Users/nickfischer/Documents/Claude Code/chirobasix-website'
const CONTENT = (sub: string) => join(WEBSITE_ROOT, 'src', 'content', sub)
const PUBLIC = (...parts: string[]) => join(WEBSITE_ROOT, 'public', ...parts)

// ─── Init Payload ──────────────────────────────────────────────────
console.log('> Booting Payload (local API mode)…')
const payload = await getPayload({ config })
const editorConfig = await editorConfigFactory.default({ config: payload.config })

console.log('> Connected to Postgres, editor config loaded')

// ─── Media cache: path on disk → Payload media doc ID ─────────────
const mediaCache = new Map<string, string>()

async function ensureMediaUpload(filePath: string, alt: string): Promise<string | null> {
  if (mediaCache.has(filePath)) return mediaCache.get(filePath)!

  try {
    const stats = await stat(filePath)
    if (!stats.isFile()) return null
  } catch {
    return null
  }

  const data = await readFile(filePath)
  const fileName = basename(filePath)

  try {
    const result = await payload.create({
      collection: 'media',
      data: { alt },
      file: {
        data,
        name: fileName,
        size: data.length,
        mimetype: mimeFor(fileName),
      },
    })
    mediaCache.set(filePath, result.id as string)
    process.stdout.write(`    media:upload ${fileName} → ${result.id}\n`)
    return result.id as string
  } catch (err) {
    console.error(`    media:upload FAIL ${fileName}:`, (err as Error).message?.substring(0, 200))
    return null
  }
}

function mimeFor(filename: string): string {
  const ext = extname(filename).toLowerCase()
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.pdf': 'application/pdf',
  }[ext] ?? 'application/octet-stream'
}

/** Convert a website-relative image path (e.g. /assets/migrated/blog/foo.webp)
 *  to a Payload media doc ID by reading from public/ and uploading. */
async function imagePathToMediaId(refPath: string | undefined, alt: string): Promise<string | null> {
  if (!refPath) return null
  if (refPath.startsWith('http')) return null // external URL — skip
  const local = PUBLIC(refPath.replace(/^\//, ''))
  return ensureMediaUpload(local, alt)
}

function md2lexical(markdown: string | undefined): unknown {
  if (!markdown || !markdown.trim()) return undefined
  try {
    return convertMarkdownToLexical({ editorConfig, markdown })
  } catch (err) {
    console.error('    md2lexical FAIL:', (err as Error).message?.substring(0, 200))
    return undefined
  }
}

// ─── Clear existing docs (idempotent) ──────────────────────────────
const COLLECTIONS = ['pages', 'services', 'resources', 'blog', 'podcast', 'redirects'] as const

async function clearAll() {
  for (const collection of COLLECTIONS) {
    const all = await payload.find({ collection, limit: 1000, depth: 0 })
    if (all.docs.length === 0) continue
    process.stdout.write(`> clear ${collection}: ${all.docs.length} docs… `)
    for (const doc of all.docs) {
      await payload.delete({ collection, id: (doc as { id: string }).id })
    }
    process.stdout.write('done\n')
  }
}

// ─── Per-collection migrators ───────────────────────────────────────

async function listMdFiles(dir: string): Promise<{ slug: string; abs: string }[]> {
  const files = await readdir(dir).catch(() => [])
  return files
    .filter((f) => (f.endsWith('.md') || f.endsWith('.mdx')) && !f.startsWith('_'))
    .map((f) => ({ slug: f.replace(/\.mdx?$/, ''), abs: join(dir, f) }))
}

async function migratePages() {
  const files = await listMdFiles(CONTENT('pages'))
  for (const { slug, abs } of files) {
    const { data, content } = matter(await readFile(abs, 'utf8'))
    process.stdout.write(`  pages:${slug}\n`)
    const ogImage = await imagePathToMediaId(data.ogImage, data.title || slug)
    await payload.create({
      collection: 'pages',
      data: {
        title: data.title || slug,
        slug,
        description: data.description || '',
        ...(ogImage ? { ogImage } : {}),
        body: md2lexical(content),
      },
    })
  }
  console.log(`> pages: ${files.length} migrated`)
}

async function migrateServices() {
  const files = await listMdFiles(CONTENT('services'))
  for (const { slug, abs } of files) {
    const { data, content } = matter(await readFile(abs, 'utf8'))
    process.stdout.write(`  services:${slug}\n`)
    const heroImage = await imagePathToMediaId(data.heroImage, `${data.title} hero`)
    const ogImage = await imagePathToMediaId(data.ogImage, `${data.title} OG`)
    await payload.create({
      collection: 'services',
      data: {
        title: data.title,
        slug,
        description: data.description || '',
        subtitle: data.subtitle,
        eyebrow: data.eyebrow,
        ...(heroImage ? { heroImage } : {}),
        ...(ogImage ? { ogImage } : {}),
        ...(data.cta ? { cta: data.cta } : {}),
        ...(data.publishDate ? { publishDate: data.publishDate } : {}),
        body: md2lexical(content),
      },
    })
  }
  console.log(`> services: ${files.length} migrated`)
}

async function migrateResources() {
  const files = await listMdFiles(CONTENT('resources'))
  for (const { slug, abs } of files) {
    const { data, content } = matter(await readFile(abs, 'utf8'))
    process.stdout.write(`  resources:${slug}\n`)
    const heroImage = await imagePathToMediaId(data.heroImage, `${data.title} hero`)
    const ogImage = await imagePathToMediaId(data.ogImage, `${data.title} OG`)
    await payload.create({
      collection: 'resources',
      data: {
        title: data.title,
        slug,
        description: data.description || '',
        ...(data.leadMagnetType ? { leadMagnetType: data.leadMagnetType } : {}),
        ...(heroImage ? { heroImage } : {}),
        ...(ogImage ? { ogImage } : {}),
        ...(data.formFields ? { formFields: data.formFields } : {}),
        ...(data.postSubmitRedirect ? { postSubmitRedirect: data.postSubmitRedirect } : {}),
        body: md2lexical(content),
      },
    })
  }
  console.log(`> resources: ${files.length} migrated`)
}

async function migrateBlog() {
  const files = await listMdFiles(CONTENT('blog'))
  for (const { slug, abs } of files) {
    const { data, content } = matter(await readFile(abs, 'utf8'))
    process.stdout.write(`  blog:${slug}\n`)
    const heroImage = await imagePathToMediaId(data.heroImage, data.heroImageAlt || `${data.title} hero`)
    const ogImage = await imagePathToMediaId(data.ogImage, `${data.title} OG`)
    await payload.create({
      collection: 'blog',
      data: {
        title: data.title,
        slug,
        description: data.description || '',
        category: data.category,
        publishDate: data.publishDate,
        ...(data.updateDate ? { updateDate: data.updateDate } : {}),
        author: data.author,
        ...(heroImage ? { heroImage } : {}),
        heroImageAlt: data.heroImageAlt,
        excerpt: data.excerpt,
        readingTimeMinutes: data.readingTimeMinutes,
        ...(Array.isArray(data.tags) ? { tags: data.tags.map((tag: string) => ({ tag })) } : {}),
        ...(Array.isArray(data.tocAnchors)
          ? {
              tocAnchors: data.tocAnchors.map(
                (a: { id?: string; label?: string }) => ({ anchor: a.id, label: a.label }),
              ),
            }
          : {}),
        ...(ogImage ? { ogImage } : {}),
        body: md2lexical(content),
      },
    })
  }
  console.log(`> blog: ${files.length} migrated`)
}

async function migratePodcast() {
  const files = await listMdFiles(CONTENT('podcast'))
  for (const { slug, abs } of files) {
    const { data, content } = matter(await readFile(abs, 'utf8'))
    process.stdout.write(`  podcast:${slug}\n`)
    const heroImage = await imagePathToMediaId(data.heroImage, `${data.title} cover`)
    const ogImage = await imagePathToMediaId(data.ogImage, `${data.title} OG`)
    await payload.create({
      collection: 'podcast',
      data: {
        title: data.title,
        slug,
        description: data.description || '',
        episodeNumber: data.episodeNumber,
        seasonNumber: data.seasonNumber,
        category: data.category,
        publishDate: data.publishDate,
        audioEmbedHtml: data.audioEmbedHtml,
        audioUrl: data.audioUrl,
        durationLabel: data.durationLabel,
        durationMinutes: data.durationMinutes,
        videoEmbedUrl: data.videoEmbedUrl,
        youtubeId: data.youtubeId,
        ...(Array.isArray(data.hosts) ? { hosts: data.hosts.map((name: string) => ({ name })) } : {}),
        ...(Array.isArray(data.guests) ? { guests: data.guests.map((name: string) => ({ name })) } : {}),
        ...(Array.isArray(data.chapters) ? { chapters: data.chapters } : {}),
        ...(Array.isArray(data.linksMentioned) ? { linksMentioned: data.linksMentioned } : {}),
        ...(Array.isArray(data.transcript) ? { transcript: data.transcript } : {}),
        ...(Array.isArray(data.tags) ? { tags: data.tags.map((tag: string) => ({ tag })) } : {}),
        showNotes: data.showNotes,
        ...(heroImage ? { heroImage } : {}),
        ...(ogImage ? { ogImage } : {}),
        body: md2lexical(content),
      },
    })
  }
  console.log(`> podcast: ${files.length} migrated`)
}

async function migrateRedirects() {
  // Source: chirobasix-website/src/data/redirects/*.json (Tina-managed)
  const dir = join(WEBSITE_ROOT, 'src', 'data', 'redirects')
  const files = (await readdir(dir).catch(() => [])).filter(
    (f) => f.endsWith('.json') && !f.startsWith('_') && f !== '.gitkeep',
  )
  for (const f of files) {
    const data = JSON.parse(await readFile(join(dir, f), 'utf8'))
    process.stdout.write(`  redirects:${data.fromPath}\n`)
    await payload.create({
      collection: 'redirects',
      data: {
        fromPath: data.fromPath,
        toPath: data.toPath,
        statusCode: String(data.statusCode),
        note: data.note,
      },
    })
  }
  console.log(`> redirects: ${files.length} migrated`)
}

// ─── Run ────────────────────────────────────────────────────────────
console.log('\n══ CLEARING ══')
await clearAll()

console.log('\n══ MIGRATING ══')
await migratePages()
await migrateServices()
await migrateResources()
await migrateBlog()
await migratePodcast()
await migrateRedirects()

console.log('\n══ DONE ══')
console.log(`  media uploaded: ${mediaCache.size} unique files`)
process.exit(0)
