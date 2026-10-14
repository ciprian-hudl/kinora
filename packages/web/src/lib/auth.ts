import type { BetterAuthClientPlugin } from 'better-auth/client'
import { apiKeyClient } from '@better-auth/api-key/client'
import { polarClient } from '@polar-sh/better-auth/client'
import { deviceAuthorizationClient, lastLoginMethodClient, organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import { env } from '@/lib/env'

// @polar-sh/better-auth 2.x annotates getActions with a $fetch type TS cannot relate to
// BetterAuthClientPlugin's, which collapses every plugin's inference. Only the server-plugin
// inference (checkout, customer portal) is used, so drop the unused checkoutEmbed action.
const { id, $InferServerPlugin } = polarClient()
const polar = { id, $InferServerPlugin } satisfies BetterAuthClientPlugin

export const authClient = createAuthClient({
  baseURL: env.serverUrl,
  plugins: [apiKeyClient(), lastLoginMethodClient(), organizationClient(), polar, deviceAuthorizationClient()],
})
