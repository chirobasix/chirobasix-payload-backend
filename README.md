# chirobasix-payload-backend

Payload CMS backend for chirobasix.com — replaces the prior
`chirobasix-tina-backend` (TinaCMS) which hit too many customization
limits.

## What it is

- **Admin UI:** `admin.chirobasix.com` (Vercel)
- **Database:** Postgres (Supabase, dedicated `chirobasix-payload` project)
- **Media:** Cloudflare R2 (shared `chirobasix-website-media` bucket;
  Payload writes under `/media/`, lead-magnets and blog-content live
  alongside)
- **Public site:** chirobasix-website (Astro on CF Pages) — fetches
  content via Payload REST/GraphQL at **build time**. The public
  bundle ships zero Payload code; admin and public site are fully
  isolated.

## Collections

| Collection | Singular | Plural | Default sort |
|---|---|---|---|
| pages | Page | Pages | title |
| blog | Blog Post | Blog Posts | -publishDate |
| podcast | Podcast Episode | Podcast Episodes | -publishDate |
| services | Service | Services | title |
| resources | Resource | Resources (Lead Magnets) | title |
| redirects | Redirect | Redirects | fromPath |
| users | Team Member | Team Members | email |
| media | Media File | Media Library | -updatedAt |

Each collection sets `admin.defaultColumns`, `admin.listSearchableFields`,
`admin.livePreview`, and per-operation access control — all the
customization Tina couldn't give us.

## Local development

```bash
cp .env.example .env
# fill in DATABASE_URI + PAYLOAD_SECRET + R2 credentials
npm install
npm run dev
# Admin at http://localhost:3000/admin
```

## Deploying

Vercel auto-deploys from `main`. Required env vars:

- `PAYLOAD_SECRET`
- `DATABASE_URI`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_ENDPOINT`
- `NEXT_PUBLIC_SITE_URL`

## REST / GraphQL API

- REST: `https://admin.chirobasix.com/api/<collection>`
- GraphQL: `https://admin.chirobasix.com/api/graphql`
- GraphQL Playground: `https://admin.chirobasix.com/api/graphql-playground`

Public collections (pages/blog/podcast/services/resources/redirects)
have `access.read: () => true`, so build-time fetches don't need auth.
Write operations require a logged-in user.
