import type { AppRouter } from '@kinora/server'
import { createTRPCClient, httpBatchLink, httpLink, splitLink } from '@trpc/client'
import { env } from '@/lib/env'
import { session } from '@/lib/session'
import { router } from '@/router'

const url = `${env.serverUrl}/trpc`

async function sessionFetch(input: RequestInfo | URL, opts?: RequestInit): Promise<Response> {
  const res = await fetch(input, { ...opts, credentials: 'include' })
  // Session expired or revoked mid-app: drop the stale user and bounce to login.
  if (res.status === 401) {
    session.setUser(null)
    if (router.currentRoute.value.name !== 'login')
      void router.push({ name: 'login' })
  }
  return res
}

// A batch answers once its slowest call does, so a slow call asks to go on its own (`skipBatch`).
export const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: op => op.context.skipBatch === true,
      true: httpLink({ url, fetch: sessionFetch }),
      false: httpBatchLink({ url, fetch: sessionFetch }),
    }),
  ],
})
