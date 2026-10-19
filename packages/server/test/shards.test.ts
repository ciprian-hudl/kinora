import type { IngestRun, NormTest } from '@kinora/core'
import { makeTestKey, RERUN_ANNOTATION } from '@kinora/core'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/alerts/notify', () => ({ notifyRun: vi.fn().mockResolvedValue(undefined) }))
vi.resetModules()

const { notifyRun } = await import('../src/alerts/notify')
const { currentPeriodResults } = await import('../src/billing/usage')
const { db } = await import('../src/db')
const { artifact, run, test } = await import('../src/db/schemas/index')
const { closeStaleOpenRuns, OPEN_RUN_TIMEOUT_MS } = await import('../src/public-api/shard-sweep')
const { createApiKey, createUser, ingest, ownedOrgId, resetDb } = await import('./helpers')

const notify = vi.mocked(notifyRun)

beforeEach(async () => {
  await resetDb()
  notify.mockClear()
})

function normTest(title: string, status: NormTest['status'] = 'expected'): NormTest {
  const file = 'tests/shop.spec.ts'
  const titlePath = [file, title]
  return {
    testKey: makeTestKey(file, titlePath, 'chromium'),
    title,
    titlePath,
    file,
    line: 1,
    column: 1,
    projectName: 'chromium',
    status,
    ok: status !== 'unexpected',
    duration: 100,
    retries: 0,
    tags: ['@shop'],
    annotations: [],
    errors: status === 'unexpected' ? [{ message: `${title} failed` }] : [],
    attachments: [],
  }
}

function shardPayload(current: number, tests: NormTest[], opts: { attempt?: number, total?: number, startedAt?: string } = {}): IngestRun {
  const counts = { total: tests.length, expected: 0, unexpected: 0, flaky: 0, skipped: 0 }
  for (const t of tests)
    counts[t.status]++
  return {
    project: { slug: 'web-app', name: 'web-app' },
    run: {
      startedAt: opts.startedAt ?? new Date().toISOString(),
      duration: 1000,
      counts,
      git: { branch: 'main' },
      groupKey: 'gh-42',
      attempt: opts.attempt ?? 1,
      shard: { current, total: opts.total ?? 2 },
    },
    tests,
  }
}

interface Body {
  runId: string
  status?: string
  shardProgress?: { landed: number, total: number }
  counts?: { total: number, flaky: number }
  flaky?: { title: string, rerunAttempt?: number }[]
}

async function upload(key: string, payload: IngestRun): Promise<Body> {
  const res = await ingest(key, payload)
  expect(res.status).toBe(201)
  return res.json() as Promise<Body>
}

describe('grouped shard uploads', () => {
  it('assembles the shards of a CI run into one run, complete once every shard landed', async () => {
    const key = await createApiKey((await createUser()).id)

    const first = await upload(key, shardPayload(1, [normTest('a'), normTest('b', 'unexpected')]))
    expect(first.status).toBe('open')
    expect(first.shardProgress).toEqual({ landed: 1, total: 2 })
    // The shards landed so far, for the PR comment that updates on each shard.
    expect(first.counts).toMatchObject({ total: 2, unexpected: 1 })
    expect(notify).not.toHaveBeenCalled()

    const second = await upload(key, shardPayload(2, [normTest('c')]))
    expect(second.runId).toBe(first.runId)
    expect(second.status).toBe('complete')
    expect(second.counts).toMatchObject({ total: 3 })

    const runs = await db.query.run.findMany()
    expect(runs).toHaveLength(1)
    expect(runs[0].counts).toEqual({ total: 3, expected: 2, unexpected: 1, flaky: 0, skipped: 0 })
    expect(runs[0].countsByTag['@shop'].total).toBe(3)
    expect(runs[0].notifiedAt).not.toBeNull()
    expect(notify).toHaveBeenCalledOnce()
    expect(notify.mock.calls[0][0].tests).toHaveLength(3)
  })

  it('spans the run from the first shard start to the last shard end', async () => {
    const key = await createApiKey((await createUser()).id)
    await upload(key, shardPayload(1, [normTest('a')], { startedAt: '2026-10-19T10:00:00.000Z' }))
    await upload(key, shardPayload(2, [normTest('b')], { startedAt: '2026-10-19T10:00:30.000Z' }))

    const [r] = await db.query.run.findMany()
    expect(r.startedAt.toISOString()).toBe('2026-10-19T10:00:00.000Z')
    expect(r.duration).toBe(31_000)
  })

  it('replaces a shard on a re-run and keeps a test that only passed on the re-run as flaky', async () => {
    const user = await createUser()
    const key = await createApiKey(user.id)
    const org = await ownedOrgId(user.id)

    await upload(key, shardPayload(1, [normTest('a', 'unexpected'), normTest('b')]))
    await upload(key, shardPayload(2, [normTest('c')]))
    expect(await currentPeriodResults(org)).toBe(3)

    const rerun = await upload(key, shardPayload(1, [normTest('a'), normTest('b')], { attempt: 2 }))
    expect(rerun.status).toBe('complete')
    expect(rerun.counts).toMatchObject({ total: 3, flaky: 1 })
    expect(rerun.flaky).toEqual([expect.objectContaining({ title: 'a', rerunAttempt: 2 })])

    const rows = await db.query.test.findMany()
    expect(rows).toHaveLength(3)
    const a = rows.find(t => t.title === 'a')!
    expect(a.status).toBe('flaky')
    expect(a.retries).toBe(1)
    expect(a.errors).toEqual([{ message: 'a failed' }])
    expect(a.annotations).toEqual([{ type: RERUN_ANNOTATION, description: 'passed on re-run (attempt 2)' }])

    const [r] = await db.query.run.findMany()
    expect(r.counts).toEqual({ total: 3, expected: 2, unexpected: 0, flaky: 1, skipped: 0 })
    expect(r.shardsLanded['1'].attempt).toBe(2)
    // A re-run neither counts again nor alerts again.
    expect(await currentPeriodResults(org)).toBe(3)
    expect(notify).toHaveBeenCalledOnce()
  })

  it('drops the artifacts of the replaced tests', async () => {
    const key = await createApiKey((await createUser()).id)
    const { runId } = await upload(key, shardPayload(1, [normTest('a', 'unexpected')]))
    const [row] = await db.query.test.findMany()
    await db.insert(artifact).values({ id: 'art-1', projectId: row.projectId, runId, testId: row.id, name: 'trace', contentType: 'application/zip', storageKey: 'missing/trace.zip' })

    await upload(key, shardPayload(1, [normTest('a')], { attempt: 2 }))
    expect(await db.query.artifact.findMany()).toEqual([])
  })

  it('treats a replayed upload of the same attempt as a replace, and ignores a superseded attempt', async () => {
    const user = await createUser()
    const key = await createApiKey(user.id)
    const org = await ownedOrgId(user.id)

    await upload(key, shardPayload(1, [normTest('a', 'unexpected')], { attempt: 2 }))
    await upload(key, shardPayload(1, [normTest('a', 'unexpected')], { attempt: 2 }))
    expect(await db.query.test.findMany()).toHaveLength(1)

    // A late upload of attempt 1 must not overwrite attempt 2.
    await upload(key, shardPayload(1, [normTest('a')], { attempt: 1 }))
    const [a] = await db.query.test.findMany()
    expect(a.status).toBe('unexpected')
    expect(await currentPeriodResults(org)).toBe(1)
  })

  it('keeps separate runs for separate CI runs, and single uploads untouched', async () => {
    const key = await createApiKey((await createUser()).id)
    await upload(key, shardPayload(1, [normTest('a')]))
    const other = shardPayload(1, [normTest('a')])
    other.run.groupKey = 'gh-43'
    await upload(key, other)
    const single = shardPayload(1, [normTest('a')])
    delete single.run.groupKey
    delete single.run.shard
    await upload(key, single)

    const runs = await db.query.run.findMany()
    expect(runs).toHaveLength(3)
    const plain = runs.find(r => !r.groupKey)!
    expect(plain.status).toBe('complete')
    expect((await db.query.test.findMany({ where: eq(test.runId, plain.id) }))[0].shardIndex).toBeNull()
    // Only the single upload notified: both grouped runs still wait for shard 2.
    expect(notify).toHaveBeenCalledOnce()
  })

  it('rejects a group key without a shard', async () => {
    const key = await createApiKey((await createUser()).id)
    const payload = shardPayload(1, [normTest('a')])
    delete payload.run.shard
    expect((await ingest(key, payload)).status).toBe(400)
  })

  it('reports the shard state on the dashboard run summary', async () => {
    const user = await createUser()
    const key = await createApiKey(user.id)
    const { runId } = await upload(key, shardPayload(1, [normTest('a')], { total: 3 }))
    const { runSummary } = await import('../src/reports/queries')
    const [r] = await db.query.run.findMany({ where: eq(run.id, runId) })
    expect(runSummary('web-app', r)).toMatchObject({ status: 'open', shardProgress: { landed: 1, total: 3 } })
  })
})

describe('closeStaleOpenRuns', () => {
  it('closes a run still missing shards past the timeout as incomplete and notifies it once', async () => {
    const key = await createApiKey((await createUser()).id)
    await upload(key, shardPayload(1, [normTest('a')]))
    const later = new Date(Date.now() + OPEN_RUN_TIMEOUT_MS + 60_000)

    expect(await closeStaleOpenRuns(new Date())).toEqual({ closed: 0 })
    expect(await closeStaleOpenRuns(later)).toEqual({ closed: 1 })
    expect(await closeStaleOpenRuns(later)).toEqual({ closed: 0 })

    const [r] = await db.query.run.findMany()
    expect(r.status).toBe('incomplete')
    expect(notify).toHaveBeenCalledOnce()
    expect(notify.mock.calls[0][0].incomplete).toEqual({ landed: 1, total: 2 })
  })

  it('completes a closed run when its missing shard lands late, without notifying again', async () => {
    const key = await createApiKey((await createUser()).id)
    await upload(key, shardPayload(1, [normTest('a')]))
    await closeStaleOpenRuns(new Date(Date.now() + OPEN_RUN_TIMEOUT_MS + 60_000))

    const late = await upload(key, shardPayload(2, [normTest('b')]))
    expect(late.status).toBe('complete')
    expect(notify).toHaveBeenCalledOnce()
  })
})
