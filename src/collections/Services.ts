import type { CollectionConfig } from 'payload'
import { triggerRegenerate } from '../lib/regenerate-hook'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chirobasix-website.pages.dev').replace(/\/$/, '')

export const Services: CollectionConfig = {
  slug: 'services',
  labels: {
    singular: 'Service',
    plural: 'Services',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'subtitle', 'updatedAt'],
    listSearchableFields: ['title', 'subtitle'],
    livePreview: {
      url: ({ data }) => `${SITE_URL}/services/${data?.slug}/`,
    },
  },
  defaultSort: 'title',
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => (user as { role?: string } | null)?.role === 'admin',
  },
  hooks: { afterChange: [triggerRegenerate] },
  fields: [
    { name: 'title', type: 'text', label: 'Title', required: true },
    {
      name: 'slug',
      type: 'text',
      label: 'URL Slug',
      required: true,
      unique: true,
      index: true,
    },
    { name: 'subtitle', type: 'text', label: 'Subtitle' },
    { name: 'eyebrow', type: 'text', label: 'Eyebrow' },
    {
      name: 'description',
      type: 'textarea',
      label: 'SEO Description',
      required: true,
    },
    {
      name: 'heroImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Hero Image',
    },
    {
      name: 'cta',
      type: 'group',
      label: 'Call to Action',
      fields: [
        { name: 'label', type: 'text', label: 'Label' },
        { name: 'href', type: 'text', label: 'Href' },
      ],
    },
    {
      name: 'publishDate',
      type: 'date',
      label: 'Publish Date',
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'ogImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Social Share Image (OG)',
    },
    { name: 'body', type: 'richText', label: 'Body' },
  ],
}
