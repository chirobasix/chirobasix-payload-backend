import type { CollectionConfig } from 'payload'
import { triggerRegenerate } from '../lib/regenerate-hook'

/**
 * URL redirects managed by the team. Astro marketing site fetches the
 * full list at build time and bakes them into CF Pages middleware.
 *
 * Why a Payload collection vs CF Pages `_redirects` file: editors get
 * a real UI with validation, status-code dropdown, notes for audit
 * trail, and the ability to add a redirect in seconds without touching
 * code.
 */
export const Redirects: CollectionConfig = {
  slug: 'redirects',
  labels: {
    singular: 'Redirect',
    plural: 'Redirects',
  },
  admin: {
    useAsTitle: 'fromPath',
    defaultColumns: ['fromPath', 'toPath', 'statusCode', 'updatedAt'],
    listSearchableFields: ['fromPath', 'toPath', 'note'],
    description: 'Redirect old URLs to new ones (e.g. WordPress legacy URLs → new site URLs).',
  },
  defaultSort: 'fromPath',
  access: {
    read: () => true, // Astro fetches at build time
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  hooks: { afterChange: [triggerRegenerate] },
  fields: [
    {
      name: 'fromPath',
      type: 'text',
      label: 'From Path',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Old URL. Always start with /, e.g. "/old-services/seo/".',
      },
    },
    {
      name: 'toPath',
      type: 'text',
      label: 'Redirect To',
      required: true,
      admin: {
        description:
          'New URL. Start with / for internal (e.g. "/services/local-seo/") or https:// for external.',
      },
    },
    {
      name: 'statusCode',
      type: 'select',
      label: 'Status Code',
      required: true,
      defaultValue: '301',
      options: [
        { label: '301 — Permanent (recommended for SEO)', value: '301' },
        { label: '302 — Temporary', value: '302' },
        { label: '307 — Temporary + preserve method', value: '307' },
        { label: '308 — Permanent + preserve method', value: '308' },
      ],
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Note (optional)',
      admin: {
        description: 'Why was this redirect added? Helps the team understand history later.',
      },
    },
  ],
}
