import type { ErrorEvent } from '@sentry/node'
import * as Sentry from '@sentry/node'
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

  it('tags the Sentry errors of each request with its own request id, even concurrently', async () => {
    const events: ErrorEvent[] = []
    Sentry.init({
      dsn: 'https://public@sentry.example.com/1',
      defaultIntegrations: false,
      beforeSend(event) {
        events.push(event)
        return null
      },
    })

    const server = new Hono()
      .use(requestId())
      .use(requestContext)
      .get('/fail/:delay', async (c) => {
        // Interleave the two requests between tagging and capturing.
        await new Promise(resolve => setTimeout(resolve, Number(c.req.param('delay'))))
        Sentry.captureException(new Error(`failed in ${currentRequestId()}`))
        return c.text(c.get('requestId'))
      })

    const [slow, fast] = await Promise.all([server.request('/fail/30'), server.request('/fail/5')])
    await Sentry.flush(1000)

    const ids = [await slow.text(), await fast.text()]
    expect(events).toHaveLength(2)
    for (const event of events)
      expect(event.exception?.values?.[0]?.value).toBe(`failed in ${String(event.tags?.requestId)}`)
    expect(events.map(e => e.tags?.requestId).sort()).toEqual([...ids].sort())
  })
})
