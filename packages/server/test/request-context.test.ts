import { Hono } from 'hono'
import { requestId } from 'hono/request-id'
import { describe, expect, it } from 'vitest'
import { app } from '../src/app'
import { currentRequestId, requestContext } from '../src/lib/request-context'

describe('request context', () => {
  it('exposes the request id to code running deep in the request', async () => {
    const probe = new Hono()
      .use(requestId())
      .use(requestContext)
      .get('/', async (c) => {
        await new Promise(resolve => setTimeout(resolve, 1))
        return c.json({ fromContext: currentRequestId(), fromHono: c.get('requestId') })
      })

    const body = await (await probe.request('/', { headers: { 'X-Request-Id': 'req-abc' } })).json()
    expect(body).toEqual({ fromContext: 'req-abc', fromHono: 'req-abc' })
    expect(currentRequestId()).toBeUndefined()
  })

  it('returns a request id header on app responses', async () => {
    const res = await app.request('/healthcheck')
    expect(res.headers.get('X-Request-Id')).toMatch(/^[\w-]+$/)
  })
})
