import type { IngestRun } from '@kinora/core'
import type { Entitlements } from '../src/billing/entitlements'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Tests run self-host (unlimited), so pin a free plan with a tiny result cap.
const capped: Entitlements = { tier: 'free', maxProjects: 1, retentionDays: 7, includedResults: 2, storageBytes: Infinity, alerts: false }

vi.mock('../src/billing/entitlements', async importOriginal => ({
  ...(await importOriginal<typeof import('../src/billing/entitlements')>()),
  getEntitlements: async () => capped,
}))
vi.resetModules()

const { createApiKey, createUser, ingest, resetDb, runPayload } = await import('./helpers')

beforeEach(resetDb)

function shard(current: number, attempt = 1): IngestRun {
  const payload = runPayload()
  payload.run = { ...payload.run, groupKey: 'gh-1', attempt, shard: { current, total: 3 } }
  return payload
}

describe('result cap on grouped shard uploads', () => {
  it('lets a re-run of a landed shard through once the cap is reached, but no new shard', async () => {
    const key = await createApiKey((await createUser()).id)
    expect((await ingest(key, shard(1))).status).toBe(201)
    expect((await ingest(key, shard(2))).status).toBe(201)

    // The 2 included results are used: a new slot would add results, a re-run adds none.
    expect((await ingest(key, shard(3))).status).toBe(402)
    expect((await ingest(key, shard(1, 2))).status).toBe(201)
  })
})
