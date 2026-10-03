import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { purgeScope } from '../src/billing/retention'
import { currentPeriodResults, projectCount, recordResults, storageBytes } from '../src/billing/usage'
import { db } from '../src/db'
import { artifact, project, run, test as testRow } from '../src/db/schemas/index'
import { createUser, ownedOrgId, resetDb } from './helpers'

beforeEach(resetDb)

function lastInstantOfPreviousMonthUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1)
}

async function seedTests(userId: string, count: number, startedAt?: Date): Promise<void> {
  const projectId = randomUUID()
  const organizationId = await ownedOrgId(userId)
  await db.insert(project).values({ id: projectId, organizationId, slug: `slug-${projectId}`, name: 'p' })
  await recordResults(db, organizationId, startedAt ?? new Date(), count)

  const runId = randomUUID()
  await db.insert(run).values({
    id: runId,
    projectId,
    startedAt: startedAt ?? new Date(),
    duration: 0,
    counts: { total: count, expected: count, unexpected: 0, flaky: 0, skipped: 0 },
  })

  await db.insert(testRow).values(
    Array.from({ length: count }, (_, i) => ({
      id: randomUUID(),
      runId,
      projectId,
      testKey: `key-${runId}-${i}`,
      title: 't',
      titlePath: ['file.ts', 't'],
      file: 'file.ts',
      line: 1,
      column: 1,
      projectName: 'chromium',
      status: 'expected' as const,
      ok: true,
      duration: 0,
      retries: 0,
      tags: [],
      annotations: [],
      errors: [],
      attachments: [],
    })),
  )
}

describe('currentPeriodResults', () => {
  it('counts this-month results for the org', async () => {
    const user = await createUser()
    await seedTests(user.id, 3)
    expect(await currentPeriodResults(await ownedOrgId(user.id))).toBe(3)
  })

  it('excludes runs that executed in previous months', async () => {
    const user = await createUser()
    await seedTests(user.id, 3)
    await seedTests(user.id, 5, lastInstantOfPreviousMonthUtc())
    expect(await currentPeriodResults(await ownedOrgId(user.id))).toBe(3)
  })

  it('accumulates across runs in the same month', async () => {
    const user = await createUser()
    await seedTests(user.id, 3)
    await seedTests(user.id, 4)
    expect(await currentPeriodResults(await ownedOrgId(user.id))).toBe(7)
  })

  it('keeps counting results whose runs were purged by retention', async () => {
    const user = await createUser()
    const org = await ownedOrgId(user.id)
    await seedTests(user.id, 3)
    await purgeScope(new Date(Date.now() + 1000), { includeOrgs: [org] })
    expect(await db.query.run.findMany()).toHaveLength(0)
    expect(await currentPeriodResults(org)).toBe(3)
  })

  it('scopes the count to the given user', async () => {
    const user = await createUser()
    const other = await createUser('other@test.dev')
    await seedTests(user.id, 2)
    await seedTests(other.id, 4)
    expect(await currentPeriodResults(await ownedOrgId(user.id))).toBe(2)
  })
})

describe('projectCount', () => {
  it('counts the org projects', async () => {
    const user = await createUser()
    const org = await ownedOrgId(user.id)
    expect(await projectCount(org)).toBe(0)
    await seedTests(user.id, 1)
    await seedTests(user.id, 1)
    expect(await projectCount(org)).toBe(2)
  })

  it('scopes the count to the org', async () => {
    const a = await createUser('a@test.dev')
    const b = await createUser('b@test.dev')
    await seedTests(a.id, 1)
    expect(await projectCount(await ownedOrgId(b.id))).toBe(0)
  })
})

describe('storageBytes', () => {
  async function seedArtifact(userId: string, size: number): Promise<void> {
    await seedTests(userId, 1)
    const r = (await db.query.run.findMany()).at(-1)!
    await db.insert(artifact).values({
      id: randomUUID(),
      projectId: r.projectId,
      runId: r.id,
      name: 'trace',
      contentType: 'application/zip',
      storageKey: `${r.projectId}/${r.id}/trace.zip`,
      size,
    })
  }

  it('sums the artifact sizes of the org', async () => {
    const user = await createUser()
    const org = await ownedOrgId(user.id)
    expect(await storageBytes(org)).toBe(0)

    await seedArtifact(user.id, 300)
    await seedArtifact(user.id, 700)
    expect(await storageBytes(org)).toBe(1000)
  })

  it('ignores another org artifacts', async () => {
    const a = await createUser('a@test.dev')
    const b = await createUser('b@test.dev')
    await seedArtifact(a.id, 500)
    expect(await storageBytes(await ownedOrgId(b.id))).toBe(0)
  })
})
