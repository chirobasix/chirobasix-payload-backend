/**
 * Payload CMS config — chirobasix.com admin.
 *
 * Replaces the prior tinacms-authjs backend with full code-first control
 * over labels, list columns, default sort, sidebar nav, access control
 * — everything Tina couldn't customize. Astro marketing site fetches
 * content from this backend's REST/GraphQL API at build time, so the
 * public site bundle is identical (zero Payload code shipped).
 *
 * Hosting: Vercel (Next.js). Admin lives at admin.chirobasix.com.
 * Database: Postgres (Supabase, dedicated chirobasix-payload project).
 * Media: Cloudflare R2 via @payloadcms/storage-s3.
 */
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Blog } from './collections/Blog'
import { Podcast } from './collections/Podcast'
import { Services } from './collections/Services'
import { Resources } from './collections/Resources'
import { Redirects } from './collections/Redirects'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      title: 'ChiroBasix CMS',
      description: 'Content management for chirobasix.com',
    },
  },

  collections: [
    Users,
    Media,
    Pages,
    Blog,
    Podcast,
    Services,
    Resources,
    Redirects,
  ],

  editor: lexicalEditor(),

  // Postgres via Supabase (dedicated chirobasix-payload project).
  // Connection string format:
  //   postgresql://<user>:<password>@<host>:6543/postgres?pgbouncer=true
  // Supavisor pooler on port 6543 = transaction mode (Payload-friendly).
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
  }),

  // R2 (S3-compatible) for media uploads. Reuses the existing
  // chirobasix-website-media bucket — content lives under /media/...
  // alongside lead-magnets/... + blog-content/... so we don't pay for
  // two buckets.
  plugins: [
    s3Storage({
      enabled: Boolean(process.env.R2_BUCKET),
      collections: {
        media: {
          disablePayloadAccessControl: true,
          generateFileURL: ({ filename, prefix }) => {
            const key = prefix ? `${prefix}/${filename}` : `media/${filename}`
            return `${process.env.R2_PUBLIC_URL}/${key}`
          },
          prefix: 'media',
        },
      },
      bucket: process.env.R2_BUCKET || '',
      config: {
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        forcePathStyle: true,
      },
    }),
  ],

  secret: process.env.PAYLOAD_SECRET || '',

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  sharp,
})
