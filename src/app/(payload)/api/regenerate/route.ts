/**
 * POST /api/regenerate — runs the Payload → website sync engine and
 * commits the resulting markdown + redirects to the chirobasix-website
 * repo via the GitHub Contents API. CF Pages auto-deploys from the
 * new commit, so editors see their changes live within ~90s.
 *
 * Called by:
 *   • Collection afterChange hooks on every save (fire-and-forget)
 *   • The "Rebuild site" admin button (Day 4 polish)
 *   • Cron / manual ops
 *
 * Auth: shared bearer token (REGENERATE_TOKEN env var) — protects
 * against accidental hits + lets us call it from external systems.
 *
 * Idempotent: only commits files whose content actually changed.
 */
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { editorConfigFactory } from '@payloadcms/richtext-lexical'
import config from '@payload-config'
import { generateSyncFiles } from '@/lib/sync-engine'

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'chirobasix'
const GITHUB_REPO = 'chirobasix-website'
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main'
const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''

const REGENERATE_TOKEN = process.env.REGENERATE_TOKEN || ''

const GH_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'chirobasix-payload-backend',
}

interface GhFile { path: string; sha?: string; content: string }

async function getCurrentSha(path: string): Promise<string | undefined> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`
  const res = await fetch(url, { headers: GH_HEADERS })
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`gh get ${path}: ${res.status}`)
  const data = await res.json() as { sha: string }
  return data.sha
}

async function getCurrentContent(path: string): Promise<string | undefined> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`
  const res = await fetch(url, { headers: GH_HEADERS })
  if (res.status === 404) return undefined
  if (!res.ok) return undefined
  const data = await res.json() as { content: string; encoding: string }
  if (data.encoding !== 'base64') return undefined
  return Buffer.from(data.content, 'base64').toString('utf8')
}

/**
 * Commit one file (or no-op if content unchanged). Returns true if
 * a commit was made.
 */
async function commitFile(file: GhFile, commitMessage: string): Promise<boolean> {
  const existingContent = await getCurrentContent(file.path)
  if (existingContent === file.content) return false  // unchanged → skip
  const sha = await getCurrentSha(file.path)
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURI(file.path)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(file.content, 'utf8').toString('base64'),
      branch: GITHUB_BRANCH,
      sha,  // GitHub requires sha for updates; omitted/undefined for creates
    }),
  })
  if (!res.ok) {
    throw new Error(`gh put ${file.path}: ${res.status} ${(await res.text()).slice(0, 300)}`)
  }
  return true
}

export async function POST(req: Request) {
  if (!GITHUB_TOKEN) {
    return NextResponse.json({ ok: false, error: 'GITHUB_PERSONAL_ACCESS_TOKEN not set' }, { status: 500 })
  }
  if (!REGENERATE_TOKEN) {
    return NextResponse.json({ ok: false, error: 'REGENERATE_TOKEN not set' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${REGENERATE_TOKEN}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  const editorConfig = await editorConfigFactory.default({ config: payload.config })

  const { files, counts } = await generateSyncFiles(payload, editorConfig)

  // Commit each file. We do per-file PUTs instead of one tree commit
  // because GitHub's Contents API is simpler (no manual tree/blob/commit
  // dance) and per-file diffing means unchanged files don't bloat git
  // history. Tradeoff: more API calls, but ~75 fits well under the
  // 5000-req/hr authenticated GitHub rate limit.
  let committed = 0
  let unchanged = 0
  const errors: string[] = []
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  for (const [path, content] of files) {
    try {
      const wasCommitted = await commitFile(
        { path, content },
        `chore(content): sync from Payload (${path.replace(/^.*\//, '')}) — ${ts}`,
      )
      if (wasCommitted) committed++
      else unchanged++
    } catch (e) {
      errors.push(`${path}: ${(e as Error).message.slice(0, 200)}`)
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    committed,
    unchanged,
    errors: errors.length ? errors : undefined,
    counts,
  })
}
