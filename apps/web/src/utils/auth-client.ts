import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'
import { ac, admin, gerente, jefe, user } from '@access-control-system/auth/permissions'

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001',
  plugins: [adminClient({ ac, roles: { admin, user, jefe, gerente } })],
})
