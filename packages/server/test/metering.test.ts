import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Cloud mode with a stubbed Polar: only the usage call is observed, nothing leaves the process.
// Tests run self-host, so re-import the graph with the stub in place.
vi.mock('../src/billing/polar', async importOriginal => ({
  ...(await importOriginal<typeof import('../src/billing/polar')>()),
  polarClient: { customers: { create: async () => ({}) } },
  meterTestResults: vi.fn(),
}))
vi.resetModules()

const { reportPendingUsage } = await import('../src/billing/metering')
const { meterTestResults } = await import('../src/billing/polar')
const { db } = await import('../src/db')
const { run } = await import('../src/db/schemas/index')
const { createApiKey, createUser, ingest, resetDb, runPayload } = await import('./helpers')

beforeEach(resetDb)

const meter = vi.mocked(meterTestResults)
const LATER = (): Date => new Date(Date.now() + 10 * 60 * 1000)

async function pendingRuns(): Promise<string[]> {
  return (await db.select({ id: run.id }).from(run).where(eq(run.meterPending, true))).map(r => r.id)
}

beforeEach(() => {
  meter.mockReset()
})

describe('usage metering', () => {
  it('reports a run to Polar keyed by its run id and leaves nothing pending', async () => {
    const user = await createUser()
    const res = await ingest(await createApiKey(user.id))
    const { runId } = await res.json() as { runId: string }

    expect(meter).toHaveBeenCalledExactlyOnceWith(user.id, 1, runId)
    expect(await pendingRuns()).toEqual([])
  })

  it('keeps the run pending when Polar fails, then reports it on retry', async () => {
    const user = await createUser()
    meter.mockRejectedValueOnce(new Error('polar down'))
    const res = await ingest(await createApiKey(user.id))
    expect(res.status).toBe(201) // a Polar outage never fails the ingest
    const { runId } = await res.json() as { runId: string }
    expect(await pendingRuns()).toEqual([runId])

    expect(await reportPendingUsage(LATER())).toEqual({ reported: 1, failed: 0 })
    expect(meter).toHaveBeenLastCalledWith(user.id, 1, runId)
    expect(await pendingRuns()).toEqual([])
  })

  it('counts a run that still fails and retries it next time', async () => {
    const user = await createUser()
    meter.mockRejectedValue(new Error('polar down'))
    await ingest(await createApiKey(user.id))

    expect(await reportPendingUsage(LATER())).toEqual({ reported: 0, failed: 1 })
    expect(await pendingRuns()).toHaveLength(1)
  })

  it('leaves a just-ingested run to its own request', async () => {
    const user = await createUser()
    meter.mockRejectedValueOnce(new Error('polar down'))
    await ingest(await createApiKey(user.id))

    expect(await reportPendingUsage(new Date())).toEqual({ reported: 0, failed: 0 })
    expect(await pendingRuns()).toHaveLength(1)
  })

  it('never marks a run from a past period as pending', async () => {
    const user = await createUser()
    const old = runPayload()
    old.run.startedAt = new Date(Date.UTC(2020, 0, 15)).toISOString()
    await ingest(await createApiKey(user.id), old)

    expect(meter).not.toHaveBeenCalled()
    expect(await pendingRuns()).toEqual([])
  })
})
