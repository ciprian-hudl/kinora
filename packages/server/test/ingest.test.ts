import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { currentPeriodResults } from '../src/billing/usage'
import { db } from '../src/db'
import { organization } from '../src/db/schemas/index'
import { createApiKey, createUser, ingest, ownedOrgId, runPayload } from './helpers'

describe('ingest /api/v1/runs', () => {
  it('rejects a request without an api key', async () => {
    const res = await ingest(null)
    expect(res.status).toBe(401)
  })

  it('rejects an invalid api key', async () => {
    const res = await ingest('not-a-real-key')
    expect(res.status).toBe(401)
  })

  it('creates the project, run and tests, and computes countsByTag', async () => {
    const user = await createUser()
    const key = await createApiKey(user.id)

    const res = await ingest(key)
    expect(res.status).toBe(201)
    const body = await res.json() as { tests: number }
    expect(body.tests).toBe(1)

    const runs = await db.query.run.findMany()
    expect(runs).toHaveLength(1)
    expect(runs[0].countsByTag['@smoke']).toEqual({ total: 1, expected: 1, unexpected: 0, flaky: 0, skipped: 0 })

    const projects = await db.query.project.findMany()
    expect(projects).toHaveLength(1)
    expect(projects[0].slug).toBe('web-app')

    const tests = await db.query.test.findMany()
    expect(tests).toHaveLength(1)
    expect(tests[0].tags).toEqual(['@smoke'])
  })

  it('counts a run when it is received, whatever date it carries', async () => {
    const user = await createUser()
    const key = await createApiKey(user.id)
    const org = await ownedOrgId(user.id)
    await db.update(organization).set({ createdAt: new Date(Date.UTC(2019, 0, 1)) }).where(eq(organization.id, org))

    await ingest(key)
    // Dated years back, but after the workspace was created: still current usage.
    const backdated = runPayload()
    backdated.run.startedAt = new Date(Date.UTC(2020, 0, 15)).toISOString()
    await ingest(key, backdated)
    expect(await currentPeriodResults(org)).toBe(2)
  })

  it('treats a run that predates the workspace as free history', async () => {
    const user = await createUser()
    const key = await createApiKey(user.id)
    const org = await ownedOrgId(user.id)

    await ingest(key)
    const old = runPayload()
    old.run.startedAt = new Date(Date.UTC(2020, 0, 15)).toISOString()
    expect((await ingest(key, old)).status).toBe(201)
    expect(await currentPeriodResults(org)).toBe(1)
  })

  it('reuses the project on a second run for the same slug', async () => {
    const user = await createUser()
    const key = await createApiKey(user.id)

    await ingest(key, runPayload('web-app'))
    await ingest(key, runPayload('web-app'))

    expect(await db.query.project.findMany()).toHaveLength(1)
    expect(await db.query.run.findMany()).toHaveLength(2)
  })

  it('rounds fractional durations to fit the integer columns', async () => {
    const user = await createUser()
    const key = await createApiKey(user.id)

    const payload = runPayload('web-app')
    payload.run.duration = 1234.9
    payload.tests[0].duration = 56.7

    const res = await ingest(key, payload)
    expect(res.status).toBe(201)

    const runs = await db.query.run.findMany()
    expect(runs[0].duration).toBe(1235)
    const tests = await db.query.test.findMany()
    expect(tests[0].duration).toBe(57)
  })
})
