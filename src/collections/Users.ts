import type { CollectionConfig } from 'payload'

/**
 * Staff users with full admin access. A separate `clients` collection
 * (not yet activated — see Phase F follow-ups) will hold scoped client
 * logins when we have a use case.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: 'Team Member',
    plural: 'Team Members',
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'role', 'updatedAt'],
  },
  defaultSort: 'email',
  auth: true,
  access: {
    // Casts are temporary — go away after `payload generate:types`
    // regenerates payload-types.ts with the `role` field we added.
    create: ({ req: { user } }) => (user as { role?: string } | null)?.role === 'admin',
    read: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => (user as { role?: string } | null)?.role === 'admin',
    delete: ({ req: { user } }) => (user as { role?: string } | null)?.role === 'admin',
    admin: ({ req: { user } }) => Boolean(user),
  },
  fields: [
    { name: 'name', type: 'text', label: 'Full Name' },
    {
      name: 'role',
      type: 'select',
      label: 'Role',
      required: true,
      defaultValue: 'admin',
      options: [
        { label: 'Admin (full access)', value: 'admin' },
        { label: 'Editor (content only)', value: 'editor' },
      ],
    },
  ],
}
