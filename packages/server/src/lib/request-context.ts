import type { RequestIdVariables } from 'hono/request-id'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createMiddleware } from 'hono/factory'

const storage = new AsyncLocalStorage<{ requestId: string }>()

/** Id of the request being handled, wherever the call happens in its async chain. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId
}

// Runs the rest of the chain inside the request's async context, so the logger mixin can
// attach the id set by hono's requestId() middleware (registered before this one).
export const requestContext = createMiddleware<{ Variables: RequestIdVariables }>(
  (c, next) => storage.run({ requestId: c.get('requestId') }, next),
)
