import type { RequestIdVariables } from 'hono/request-id'
import { AsyncLocalStorage } from 'node:async_hooks'
import * as Sentry from '@sentry/node'
import { createMiddleware } from 'hono/factory'

const storage = new AsyncLocalStorage<{ requestId: string }>()

/** Id of the request being handled, wherever the call happens in its async chain. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId
}

// Runs the rest of the chain inside the request's async context, so the logger mixin can
// attach the id set by hono's requestId() middleware (registered before this one).
export const requestContext = createMiddleware<{ Variables: RequestIdVariables }>((c, next) => {
  const requestId = c.get('requestId')
  // Errors reported to Sentry carry the id their logs have. A scope of its own per request, so
  // concurrent requests never share it, even when the HTTP instrumentation hasn't isolated them.
  return Sentry.withIsolationScope((scope) => {
    scope.setTag('requestId', requestId)
    return storage.run({ requestId }, next)
  })
})
