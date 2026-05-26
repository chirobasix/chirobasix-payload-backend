import type { CollectionConfig } from 'payload'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chirobasix-website.pages.dev').replace(/\/$/, '')

export const Resources: CollectionConfig = {
  slug: 'resources',
  labels: {
    singular: 'Resource',
    plural: 'Resources (Lead Magnets)',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'leadMagnetType', 'updatedAt'],
    listSearchableFields: ['title', 'leadMagnetType'],
    livePreview: {
      url: ({ data }) => `${SITE_URL}/resources/${data?.slug}/`,
    },
  },
  defaultSort: 'title',
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => (user as { role?: string } | null)?.role === 'admin',
  },
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
      name: 'leadMagnetType',
      type: 'select',
      label: 'Lead Magnet Type',
      options: [
        { label: 'Guide', value: 'guide' },
        { label: 'Checklist', value: 'checklist' },
        { label: 'Tool', value: 'tool' },
        { label: 'Audit', value: 'audit' },
        { label: 'Consultation', value: 'consultation' },
        { label: 'Book', value: 'book' },
      ],
    },
    {
      name: 'heroImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Hero Image',
    },
    {
      name: 'formFields',
      type: 'array',
      label: 'Form Fields',
      admin: {
        description: 'Configures the lead-capture form on this resource page.',
      },
      fields: [
        { name: 'name', type: 'text', label: 'Field Name (machine)', required: true },
        { name: 'label', type: 'text', label: 'Label (display)', required: true },
        {
          name: 'type',
          type: 'select',
          label: 'Input Type',
          options: ['text', 'email', 'tel', 'url', 'textarea', 'checkbox', 'checkbox-group'],
        },
        { name: 'required', type: 'checkbox', label: 'Required' },
      ],
    },
    {
      name: 'postSubmitRedirect',
      type: 'text',
      label: 'Post-Submit Redirect URL',
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
