import type { CollectionConfig } from 'payload'
import { triggerRegenerate } from '../lib/regenerate-hook'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chirobasix-website.pages.dev').replace(/\/$/, '')

/**
 * Blog posts (the Marketing Journal). Renders at /blog/<slug>/.
 *
 * Fixes EVERY Tina friction point on this collection:
 *   - labels: singular/plural → button reads "Create Blog Post"
 *   - defaultColumns: publishDate visible + first → easy chronological scan
 *   - defaultSort: '-publishDate' → newest first (was alphabetical by file)
 *   - listSearchableFields → editors can search by title/category
 */
export const Blog: CollectionConfig = {
  slug: 'blog',
  labels: {
    singular: 'Blog Post',
    plural: 'Blog Posts',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'publishDate', 'category', 'author', 'updatedAt'],
    listSearchableFields: ['title', 'category', 'author'],
    livePreview: {
      url: ({ data }) => `${SITE_URL}/blog/${data?.slug}/`,
    },
  },
  defaultSort: '-publishDate', // newest first
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => (user as { role?: string } | null)?.role === 'admin',
  },
  hooks: { afterChange: [triggerRegenerate] },
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
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'SEO Description',
      required: true,
    },
    {
      name: 'category',
      type: 'text',
      label: 'Category',
      admin: {
        description: 'e.g. "Local SEO", "Facebook Ads", "Email Marketing"',
      },
    },
    {
      name: 'publishDate',
      type: 'date',
      label: 'Publish Date',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayOnly' },
      },
    },
    {
      name: 'updateDate',
      type: 'date',
      label: 'Last Updated',
      admin: {
        date: { pickerAppearance: 'dayOnly' },
        description: 'Optional — for SEO freshness signals.',
      },
    },
    {
      name: 'author',
      type: 'text',
      label: 'Author',
    },
    {
      name: 'heroImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Hero Image',
      required: true,
    },
    {
      name: 'heroImageAlt',
      type: 'text',
      label: 'Hero Image Alt Text',
    },
    {
      name: 'excerpt',
      type: 'textarea',
      label: 'Excerpt',
    },
    {
      name: 'readingTimeMinutes',
      type: 'number',
      label: 'Reading Time (minutes)',
    },
    {
      name: 'tags',
      type: 'array',
      label: 'Tags',
      fields: [{ name: 'tag', type: 'text', label: 'Tag' }],
    },
    {
      name: 'tocAnchors',
      type: 'array',
      label: 'Table of Contents Anchors',
      admin: {
        description: 'Manual TOC entries for the sticky right sidebar on long posts.',
      },
      fields: [
        // Renamed from 'id' because Payload reserves 'id' on array items
        // as the internal primary key — using 'anchor' here for the
        // visible HTML id attribute on headings.
        { name: 'anchor', type: 'text', label: 'Anchor ID (HTML)', required: true },
        { name: 'label', type: 'text', label: 'Label', required: true },
      ],
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
