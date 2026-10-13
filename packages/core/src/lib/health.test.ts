import type { TestPoint } from '../contracts/kinora'
import { describe, expect, it } from 'vitest'
import { describeHealth, diagnose } from './health'

// One point per status, oldest first; `shas` gives the commit of each run when set.
function timeline(statuses: string, shas: (string | undefined)[] = []): Pick<TestPoint, 'runId' | 'startedAt' | 'status' | 'sha'>[] {
  const status = { P: 'expected', F: 'unexpected', R: 'flaky', S: 'skipped' } as const
  return [...statuses].map((c, i) => ({
    runId: `r${i}`,
    startedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    status: status[c as keyof typeof status],
    ...(shas[i] && { sha: shas[i] }),
  }))
}

describe('diagnose', () => {
  it('calls a test that always passed stable', () => {
    expect(diagnose(timeline('PPPPP'))).toEqual({ kind: 'stable' })
    expect(diagnose([])).toEqual({ kind: 'stable' })
  })

  it('calls a test flaky when it passed and failed on the same commit', () => {
    expect(diagnose(timeline('PPFP', ['a', 'b', 'c', 'c']))).toEqual({ kind: 'flaky', reason: { type: 'same-commit', sha: 'c' } })
  })

  it('calls a test flaky when it needed a retry to pass', () => {
    expect(diagnose(timeline('PRPPR'))).toEqual({ kind: 'flaky', reason: { type: 'retry', runs: 2 } })
  })

  it('calls a test flaky when it keeps flipping between pass and fail without retries', () => {
    expect(diagnose(timeline('PFPPFP'))).toEqual({ kind: 'flaky', reason: { type: 'flips', flips: 4 } })
  })

  it('does not call one bad run flaky: it is often a regression the next commit fixed', () => {
    expect(diagnose(timeline('PPFPP', ['a', 'b', 'c', 'd', 'e']))).toEqual({ kind: 'stable' })
  })

  it('calls a test broken when it fails now and is not flaky, since the first failing run', () => {
    expect(diagnose(timeline('PPPFF', ['a', 'b', 'c', 'd', 'e']))).toEqual({
      kind: 'broken',
      since: { runId: 'r3', startedAt: '2026-01-04T00:00:00.000Z', sha: 'd' },
      runs: 2,
    })
  })

  it('keeps a flaky test that failed its latest run flaky', () => {
    expect(diagnose(timeline('PRPPF')).kind).toBe('flaky')
  })

  it('calls a flaky test broken once it failed its last 3 runs', () => {
    expect(diagnose(timeline('PRPFFF'))).toMatchObject({ kind: 'broken', runs: 3 })
  })

  it('ignores skipped runs', () => {
    expect(diagnose(timeline('PFSF'))).toMatchObject({ kind: 'broken', runs: 2, since: { runId: 'r1' } })
    expect(diagnose(timeline('PSPS'))).toEqual({ kind: 'stable' })
  })

  it('only reads flakiness in the window, but dates a long breakage from its real start', () => {
    // Flipping long ago, then failing ever since: broken, since the first run of the streak.
    const h = diagnose(timeline(`PFPFP${'F'.repeat(25)}`))
    expect(h).toMatchObject({ kind: 'broken', runs: 25, since: { runId: 'r5' } })
    expect(diagnose(timeline(`PFPFPF${'P'.repeat(20)}`)).kind).toBe('stable')
  })
})

describe('describeHealth', () => {
  it('explains each verdict in one sentence', () => {
    expect(describeHealth({ kind: 'stable' })).toBe('')
    expect(describeHealth({ kind: 'flaky', reason: { type: 'same-commit', sha: '1234567890' } })).toBe('Passed and failed on the same commit 1234567.')
    expect(describeHealth({ kind: 'flaky', reason: { type: 'retry', runs: 1 } })).toBe('Needed a retry to pass in 1 run of the last 20.')
    expect(describeHealth({ kind: 'flaky', reason: { type: 'flips', flips: 4 } })).toBe('Flipped between pass and fail 4 times in the last 20 runs.')
    expect(describeHealth({ kind: 'broken', runs: 2, since: { runId: 'r', startedAt: '', sha: 'abcdef123' } })).toBe('Failing on its last 2 runs, since commit abcdef1.')
    expect(describeHealth({ kind: 'broken', runs: 1, since: { runId: 'r', startedAt: '' } })).toBe('Failed its latest run.')
    expect(describeHealth({ kind: 'broken', runs: 1, since: { runId: 'r', startedAt: '', sha: 'abcdef123' } })).toBe('Failed its latest run, on commit abcdef1.')
  })
})
