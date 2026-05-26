import type { CollectionConfig } from 'payload'
import { triggerRegenerate } from '../lib/regenerate-hook'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chirobasix-website.pages.dev').replace(/\/$/, '')

/**
 * Podcast episodes (Chiro Success Podcast). Renders at /podcast/<slug>/.
 */
export const Podcast: CollectionConfig = {
  slug: 'podcast',
  labels: {
    singular: 'Podcast Episode',
    plural: 'Podcast Episodes',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'publishDate', 'episodeNumber', 'durationLabel', 'updatedAt'],
    listSearchableFields: ['title', 'category'],
    livePreview: {
      url: ({ data }) => `${SITE_URL}/podcast/${data?.slug}/`,
    },
  },
  defaultSort: '-publishDate',
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
    {
      name: 'description',
      type: 'textarea',
      label: 'SEO Description',
      required: true,
    },
    {
      name: 'episodeNumber',
      type: 'number',
      label: 'Episode #',
      required: true,
    },
    { name: 'seasonNumber', type: 'number', label: 'Season #' },
    { name: 'category', type: 'text', label: 'Category' },
    {
      name: 'publishDate',
      type: 'date',
      label: 'Publish Date',
      required: true,
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'audioEmbedHtml',
      type: 'textarea',
      label: 'Audio Embed HTML',
      admin: {
        description: 'Buzzsprout/Spotify/etc. embed code, if not using audioUrl alone.',
      },
    },
    { name: 'audioUrl', type: 'text', label: 'Audio URL', required: true },
    {
      name: 'durationLabel',
      type: 'text',
      label: 'Duration Label',
      admin: { description: 'Display string e.g. "38 min".' },
    },
    {
      name: 'durationMinutes',
      type: 'number',
      label: 'Duration (minutes)',
    },
    {
      name: 'videoEmbedUrl',
      type: 'text',
      label: 'YouTube Embed URL',
    },
    { name: 'youtubeId', type: 'text', label: 'YouTube Video ID' },
    {
      name: 'hosts',
      type: 'array',
      label: 'Hosts',
      fields: [{ name: 'name', type: 'text', label: 'Name' }],
    },
    {
      name: 'guests',
      type: 'array',
      label: 'Guests',
      fields: [{ name: 'name', type: 'text', label: 'Name' }],
    },
    {
      name: 'chapters',
      type: 'array',
      label: 'Chapters',
      fields: [
        { name: 'time', type: 'text', label: 'Timestamp', required: true, admin: { description: 'e.g. 02:30' } },
        { name: 'label', type: 'text', label: 'Label', required: true },
      ],
    },
    {
      name: 'linksMentioned',
      type: 'array',
      label: 'Links Mentioned',
      fields: [
        { name: 'label', type: 'text', label: 'Label' },
        { name: 'href', type: 'text', label: 'URL' },
        { name: 'icon', type: 'text', label: 'Icon (lucide name)' },
      ],
    },
    {
      name: 'transcript',
      type: 'array',
      label: 'Transcript Turns',
      fields: [
        { name: 'ts', type: 'text', label: 'Timestamp' },
        { name: 'speaker', type: 'text', label: 'Speaker' },
        { name: 'text', type: 'textarea', label: 'Text' },
      ],
    },
    {
      name: 'tags',
      type: 'array',
      label: 'Tags',
      fields: [{ name: 'tag', type: 'text', label: 'Tag' }],
    },
    { name: 'showNotes', type: 'textarea', label: 'Show Notes' },
    {
      name: 'heroImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Hero Image',
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
