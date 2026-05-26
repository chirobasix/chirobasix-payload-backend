import type { CollectionConfig } from 'payload'

/**
 * Media uploads — stored on Cloudflare R2 via the s3Storage plugin
 * (see payload.config.ts → plugins). Public-readable so the marketing
 * site can hotlink without auth.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: 'Media File',
    plural: 'Media Library',
  },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'alt', 'mimeType', 'filesize', 'updatedAt'],
  },
  defaultSort: '-updatedAt',
  access: {
    read: () => true, // public R2 URLs
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  upload: {
    mimeTypes: ['image/*', 'application/pdf'],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Alt Text',
      required: true,
      admin: {
        description: 'For accessibility + SEO. Describe what the image shows.',
      },
    },
  ],
}
