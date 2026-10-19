import type { Vitest } from 'vitest/node'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import KinoraVitestReporter from '../src/index'
import { fakeModule, fakeTest } from './fakes'

interface Call { url: string, body: unknown }

// Fake kinora server: records each request, answers the run upload, then artifact uploads.
function stubServer(status = 201): Call[] {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: init.body })
    if (String(url).endsWith('/artifacts'))
      return new Response(JSON.stringify({ url: 'https://x/a' }), { status: 201 })
    return status === 201
      ? new Response(JSON.stringify({ projectId: 'p', runId: 'run-1', tests: 1 }), { status: 201 })
      : new Response(JSON.stringify({ error: 'Plan limit reached' }), { status })
  }))
  return calls
}

function reporter(options: Partial<ConstructorParameters<typeof KinoraVitestReporter>[0]> = {}) {
  return new KinoraVitestReporter({ url: 'https://api.example.com', token: 't', project: { slug: 'ui' }, ...options })
}

const CI_VARS = ['KINORA_GROUP_KEY', 'KINORA_ATTEMPT', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'CI_PIPELINE_ID', 'CI_JOB_ID']

// A CI runner sets these itself: start every test without them.
beforeEach(() => {
  for (const v of CI_VARS) delete process.env[v]
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const v of CI_VARS) delete process.env[v]
})

describe('onInit', () => {
  it('turns on test locations for the run and every project', () => {
    const projects = [{ config: {} }, { config: {} }]
    const vitest = { config: {}, projects } as unknown as Vitest
    reporter().onInit(vitest)
    expect((vitest.config as { includeTaskLocation?: boolean }).includeTaskLocation).toBe(true)
    expect(projects.every(p => (p.config as { includeTaskLocation?: boolean }).includeTaskLocation)).toBe(true)
  })
})

describe('onTestRunEnd', () => {
  it('uploads the browser tests of the run with their counts', async () => {
    const calls = stubServer()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await reporter().onTestRunEnd([fakeModule([
      fakeTest({ name: 'passes' }),
      fakeTest({ name: 'fails', state: 'failed' }),
      fakeTest({ name: 'adds', browser: false, project: 'unit' }),
    ])])

    expect(calls).toHaveLength(1)
    const payload = JSON.parse(calls[0].body as string)
    expect(payload.project).toEqual({ slug: 'ui', name: 'ui' })
    expect(payload.tests.map((t: { title: string }) => t.title)).toEqual(['passes', 'fails'])
    expect(payload.run.counts).toMatchObject({ total: 2, expected: 1, unexpected: 1 })
  })

  it('uploads the trace of a test after the run', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kinora-vitest-'))
    const trace = join(dir, 'x.trace.zip')
    await writeFile(trace, 'zip')
    try {
      const calls = stubServer()
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      await reporter().onTestRunEnd([fakeModule([fakeTest({ annotations: [{ type: 'traces', message: 'x', attachment: { path: trace } }] })])])

      expect(calls.map(c => c.url.replace('https://api.example.com', ''))).toEqual(['/api/v1/runs', '/api/v1/runs/run-1/artifacts'])
      expect(log.mock.calls.flat().join(' ')).toContain('uploaded 1 tests + 1 artifacts')
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('explains why nothing was uploaded from a Node-only run, and uploads it with include: all', async () => {
    const calls = stubServer()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const run = [fakeModule([fakeTest({ browser: false, project: 'unit' })])]

    await reporter().onTestRunEnd(run)
    expect(calls).toHaveLength(0)
    expect(warn.mock.calls.flat().join(' ')).toContain('no browser tests in this run (1 Node tests left out)')

    await reporter({ include: 'all' }).onTestRunEnd(run)
    expect(calls).toHaveLength(1)
  })

  it('skips the upload without a token', async () => {
    const calls = stubServer()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const token = process.env.KINORA_TOKEN
    delete process.env.KINORA_TOKEN
    try {
      await reporter({ token: undefined }).onTestRunEnd([fakeModule([fakeTest()])])
    }
    finally {
      if (token !== undefined)
        process.env.KINORA_TOKEN = token
    }
    expect(calls).toHaveLength(0)
    expect(warn.mock.calls.flat().join(' ')).toContain('missing token')
  })

  it('never fails the test run when the server refuses the upload', async () => {
    stubServer(402)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(reporter().onTestRunEnd([fakeModule([fakeTest()])])).resolves.toBeUndefined()
    expect(warn.mock.calls.flat().join(' ')).toContain('Plan limit reached')
  })
})

describe('sharded runs', () => {
  function shardedReporter(options: Partial<ConstructorParameters<typeof KinoraVitestReporter>[0]> = {}, shard = { index: 2, count: 3 }) {
    const r = reporter(options)
    r.onInit({ config: { shard }, projects: [] } as unknown as Vitest)
    return r
  }

  it('groups a shard by the CI run, with its attempt and slot', async () => {
    const calls = stubServer()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    process.env.GITHUB_RUN_ID = '42'
    process.env.GITHUB_RUN_ATTEMPT = '2'
    await shardedReporter().onTestRunEnd([fakeModule([fakeTest()])])

    expect(JSON.parse(calls[0].body as string).run).toMatchObject({ groupKey: 'gh-42', attempt: 2, shard: { current: 2, total: 3 } })
  })

  it('takes an explicit group key from the option', async () => {
    const calls = stubServer()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    process.env.GITHUB_RUN_ID = '42'
    await shardedReporter({ groupKey: 'nightly-7:firefox' }).onTestRunEnd([fakeModule([fakeTest()])])

    expect(JSON.parse(calls[0].body as string).run.groupKey).toBe('nightly-7:firefox')
  })

  it('uploads a shard on its own without a CI run id, when grouping is off, or without --shard', async () => {
    const calls = stubServer()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await shardedReporter().onTestRunEnd([fakeModule([fakeTest()])])

    process.env.GITHUB_RUN_ID = '42'
    await shardedReporter({ groupKey: false }).onTestRunEnd([fakeModule([fakeTest()])])
    await reporter().onTestRunEnd([fakeModule([fakeTest()])])

    expect(calls).toHaveLength(3)
    for (const call of calls)
      expect(JSON.parse(call.body as string).run).not.toHaveProperty('groupKey')
  })

  it('still fills the slot of a shard that ran no browser test, or the run would never complete', async () => {
    const calls = stubServer()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.GITHUB_RUN_ID = '42'
    await shardedReporter().onTestRunEnd([fakeModule([fakeTest({ browser: false, project: 'unit' })])])

    expect(calls).toHaveLength(1)
    const { run, tests } = JSON.parse(calls[0].body as string)
    expect(tests).toEqual([])
    expect(run).toMatchObject({ groupKey: 'gh-42', shard: { current: 2, total: 3 }, counts: { total: 0 } })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('filling its slot'))
  })

  it('shows the shards landed so far', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ projectId: 'p', runId: 'run-1', tests: 1, status: 'open', shardProgress: { landed: 2, total: 3 } }), { status: 201 })))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    process.env.GITHUB_RUN_ID = '42'
    await shardedReporter().onTestRunEnd([fakeModule([fakeTest()])])

    expect(log).toHaveBeenCalledWith(expect.stringContaining('2 of 3 shards'))
  })
})
