import type { IngestRun, NormTest, RootCauses, TestInsight, TestOccurrences } from '@kinora/core'
import { randomUUID } from 'node:crypto'
import { makeTestKey } from '@kinora/core'
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { app } from '../src/app'
import { db } from '../src/db'
import { artifact, run, test } from '../src/db/schemas/index'
import { createApiKey, createUser, ingest } from './helpers'

const HOUR = 3_600_000
const FILE = 'tests/checkout.spec.ts'

function get<T>(path: string, key: string): Promise<T> {
  return Promise.resolve(app.request(`/api/v1${path}`, { headers: { Authorization: `Bearer ${key}` } })).then(r => r.json() as Promise<T>)
}

function testOf(title: string, status: NormTest['status'], message = 'Error: connection refused'): NormTest {
  const titlePath = [FILE, title]
  return {
    testKey: makeTestKey(FILE, titlePath, 'chromium'),
    title,
    titlePath,
    file: FILE,
    line: 7,
    column: 3,
    projectName: 'chromium',
    status,
    ok: status !== 'unexpected',
    duration: 10,
    retries: status === 'flaky' ? 1 : 0,
    tags: [],
    annotations: [],
    errors: status === 'expected' ? [] : [{ message }],
    attachments: [],
  }
}

function runOf(slug: string, hoursAgo: number, tests: NormTest[], branch = 'main'): IngestRun {
  const counts = { total: tests.length, expected: 0, unexpected: 0, flaky: 0, skipped: 0 }
  for (const t of tests)
    counts[t.status]++
  return { project: { slug, name: slug }, run: { startedAt: new Date(Date.now() - hoursAgo * HOUR).toISOString(), duration: 10, counts, git: { branch, sha: `sha${hoursAgo}` } }, tests }
}

async function seed() {
  const a = await createUser('a@test.dev')
  const key = await createApiKey(a.id)
  const post = (payload: IngestRun) => ingest(key, payload)
  // watch/e2e: "pays" fails 3 times and flakes once; "logs in" flakes in 2 of 3 runs.
  await post(runOf('watch/e2e', 1, [testOf('pays', 'unexpected'), testOf('logs in', 'flaky', 'Error: timeout 5000ms'), testOf('searches', 'expected')]))
  await post(runOf('watch/e2e', 2, [testOf('pays', 'unexpected'), testOf('logs in', 'flaky', 'Error: timeout 3000ms'), testOf('searches', 'expected')]))
  await post(runOf('watch/e2e', 3, [testOf('pays', 'unexpected'), testOf('logs in', 'expected'), testOf('searches', 'expected')], 'thor/feature'))
  await post(runOf('watch/e2e', 4, [testOf('pays', 'flaky'), testOf('logs in', 'expected'), testOf('searches', 'expected')]))
  await post(runOf('watch/e2e', 5, [testOf('pays', 'expected')]))
  // A marvel project failing with the same connection error, and one failure outside a day.
  await post(runOf('hudl/hudl-ui', 1, [testOf('renders', 'unexpected')]))
  await post(runOf('hudl/hudl-ui', 30, [testOf('renders', 'unexpected', 'Error: old failure')]))
  return key
}

const keyOf = (title: string) => makeTestKey(FILE, [FILE, title], 'chromium')

describe('insights: tests', () => {
  it('ranks the tests that failed or flaked most in the window, with their newest failure', async () => {
    const key = await seed()
    const { tests } = await get<{ tests: TestInsight[] }>('/insights/tests?since=24h', key)
    expect(tests.map(t => [t.project, t.title, t.fails, t.flakes])).toEqual([
      ['watch/e2e', 'pays', 3, 1],
      ['watch/e2e', 'logs in', 0, 2],
      ['hudl/hudl-ui', 'renders', 1, 0],
    ])
    const [pays] = tests
    expect(pays).toMatchObject({ runs: 5, location: `${FILE}:7`, failRate: 0.6 })
    expect(pays.latest).toMatchObject({ status: 'unexpected', branch: 'main', sha: 'sha1', error: { message: 'Error: connection refused' } })
  })

  it('scopes by project glob, branch, status and time', async () => {
    const key = await seed()
    const titles = async (q: string) => (await get<{ tests: TestInsight[] }>(`/insights/tests?${q}`, key)).tests.map(t => t.title)
    expect(await titles('since=24h&projects=hudl/hudl-*')).toEqual(['renders'])
    expect(await titles('since=24h&projects=!hudl/hudl-*&status=flaky')).toEqual(['logs in', 'pays'])
    expect((await get<{ tests: TestInsight[] }>('/insights/tests?since=24h&branch=default', key)).tests[0]).toMatchObject({ title: 'pays', fails: 2 })
    expect((await get<{ tests: TestInsight[] }>('/insights/tests?since=2d&projects=hudl/*', key)).tests[0]).toMatchObject({ fails: 2 })
  })

  it('ranks by flake rate, leaving out tests with too few runs', async () => {
    const key = await seed()
    const { tests } = await get<{ tests: TestInsight[] }>('/insights/tests?since=24h&sort=flakeRate', key)
    expect(tests.map(t => [t.title, t.flakeRate])).toEqual([['logs in', 2 / 4], ['pays', 1 / 5]])
  })

  it('rejects a window it cannot read', async () => {
    const a = await createUser('a@test.dev')
    const res = await app.request('/api/v1/insights/tests?since=yesterday', { headers: { Authorization: `Bearer ${await createApiKey(a.id)}` } })
    expect(res.status).toBe(400)
  })
})

describe('insights: root causes', () => {
  it('groups the failures by their normalized error across projects, incidents apart', async () => {
    const key = await seed()
    await db.update(run).set({ incident: { rule: 'host-unreachable', reason: 'Staging was down.' } }).where(sql`${run.git}->>'sha' = 'sha5'`)
    const r = await get<RootCauses>('/insights/root-causes?since=24h', key)
    expect(r.causes.map(c => [c.title, c.occurrences, c.tests, c.projects.sort()])).toEqual([
      ['Error: connection refused', 5, 2, ['hudl/hudl-ui', 'watch/e2e']],
      ['Error: timeout 5000ms', 2, 1, ['watch/e2e']],
    ])
    expect(r.causes[0].examples.map(e => e.title).sort()).toEqual(['pays', 'renders'])
    expect(r.incidents).toEqual([{ project: 'watch/e2e', runs: 1, reason: 'Staging was down.' }])
  })
})

describe('insights: test occurrences', () => {
  it('lists a test\'s failures newest first with traces, and its newest pass', async () => {
    const key = await seed()
    const [newest] = await db.select({ id: test.id, runId: run.id, projectId: run.projectId }).from(test).innerJoin(run, eq(run.id, test.runId)).where(and(eq(test.testKey, keyOf('pays')), sql`${run.git}->>'sha' = 'sha1'`))
    await db.insert(artifact).values({ id: randomUUID(), projectId: newest.projectId, runId: newest.runId, testId: newest.id, name: 'trace', contentType: 'application/zip', storageKey: `${newest.projectId}/${newest.runId}/trace.zip`, size: 4 })

    const r = await get<TestOccurrences>(`/projects/${encodeURIComponent('watch/e2e')}/occurrences?since=24h&testKey=${encodeURIComponent(keyOf('pays'))}`, key)
    expect(r).toMatchObject({ title: 'pays', runs: 5, fails: 3, flakes: 1 })
    expect(r.occurrences.map(o => o.sha)).toEqual(['sha1', 'sha2', 'sha3', 'sha4'])
    expect(r.occurrences[0].traceUrl).toContain('sig=')
    expect(r.lastPass).toMatchObject({ status: 'expected', sha: 'sha5', traceUrl: null })

    const flaky = await get<TestOccurrences>(`/projects/${encodeURIComponent('watch/e2e')}/occurrences?since=24h&status=flaky&testKey=${encodeURIComponent(keyOf('pays'))}`, key)
    expect(flaky.occurrences.map(o => o.sha)).toEqual(['sha4'])
  })
})
