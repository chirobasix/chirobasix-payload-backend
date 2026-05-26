import type { CollectionConfig } from 'payload'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chirobasix-website.pages.dev').replace(/\/$/, '')

/**
 * Top-level marketing pages (home, about, contact, privacy, terms, etc.).
 * Renders at /<slug> on the Astro marketing site, except 'home' which
 * renders at /.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: {
    singular: 'Page',
    plural: 'Pages',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'updatedAt'],
    livePreview: {
      url: ({ data }) =>
        data?.slug === 'home' ? `${SITE_URL}/` : `${SITE_URL}/${data?.slug}/`,
    },
  },
  defaultSort: 'title',
  access: {
    read: () => true, // public reads — Astro fetches at build time
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => (user as { role?: string } | null)?.role === 'admin',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Title',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      label: 'URL Slug',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'URL path. Use "home" for the homepage (/), otherwise the page lives at /<slug>/.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'SEO Description',
      required: true,
    },
    {
      name: 'ogImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Social Share Image (OG)',
    },
    {
      name: 'body',
      type: 'richText',
      label: 'Body',
    },
  ],
}
