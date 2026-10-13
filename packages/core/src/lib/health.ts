import type { TestPoint } from '../contracts/kinora'
import { HEALTH_WINDOW } from './history'

// Flaky or broken, read from a test's timeline. Playwright only calls a test flaky when it passed
// on a retry within one run; without retries (Vitest's default) a flaky test just passes one run
// and fails the next. So a test is also flaky when it passed and failed on the same commit, or
// keeps flipping between pass and fail. Broken is the other case: it fails and keeps failing.

// pass -> fail -> pass is two flips: one bad run, often a regression the next commit fixed.
// Three flips means it failed twice, apart: a pattern.
export const FLAKY_FLIPS = 3
// Failing on its last N runs makes a test broken even if it flaked before: it no longer passes.
export const BROKEN_STREAK = 3

export type FlakyReason
  = | { type: 'same-commit', sha: string }
    | { type: 'retry', runs: number }
    | { type: 'flips', flips: number }

type Point = Pick<TestPoint, 'runId' | 'startedAt' | 'status' | 'sha'>

export type TestHealth
  = | { kind: 'stable' }
    | { kind: 'flaky', reason: FlakyReason }
    // `since`: the first run of the current failing streak; `runs`: how long that streak is.
    | { kind: 'broken', since: Pick<TestPoint, 'runId' | 'startedAt' | 'sha'>, runs: number }

const failed = (p: Point): boolean => p.status === 'unexpected'

// Most certain first: same code, two outcomes. A flaky point passed in the end, so it counts as a pass.
function flakyReason(points: Point[]): FlakyReason | undefined {
  const outcomes = new Map<string, Set<boolean>>()
  for (const p of points) {
    if (p.sha)
      outcomes.set(p.sha, (outcomes.get(p.sha) ?? new Set()).add(failed(p)))
  }
  const sameCommit = [...points].reverse().find(p => p.sha && outcomes.get(p.sha)!.size === 2)
  if (sameCommit?.sha)
    return { type: 'same-commit', sha: sameCommit.sha }

  const retried = points.filter(p => p.status === 'flaky').length
  if (retried)
    return { type: 'retry', runs: retried }

  const flips = points.slice(1).filter((p, i) => failed(p) !== failed(points[i])).length
  return flips >= FLAKY_FLIPS ? { type: 'flips', flips } : undefined
}

// Health over the last `window` runs, the same window as the dashboard's timelines and rates.
// Skipped runs say nothing either way and are left out.
export function diagnose(points: Point[], window = HEALTH_WINDOW): TestHealth {
  const executed = points.filter(p => p.status !== 'skipped')
  // The streak reads the whole history, so `since` is right for a test broken longer than the window.
  let streak = 0
  while (streak < executed.length && failed(executed[executed.length - 1 - streak]))
    streak++

  const flaky = flakyReason(executed.slice(-window))
  if (streak && (!flaky || streak >= BROKEN_STREAK)) {
    const { runId, startedAt, sha } = executed[executed.length - streak]
    return { kind: 'broken', since: { runId, startedAt, ...(sha && { sha }) }, runs: streak }
  }
  return flaky ? { kind: 'flaky', reason: flaky } : { kind: 'stable' }
}

const short = (sha: string): string => sha.slice(0, 7)
const times = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

// Why a test got its health, in one sentence for a tooltip or an agent. Empty for a stable test.
export function describeHealth(h: TestHealth, window = HEALTH_WINDOW): string {
  if (h.kind === 'stable')
    return ''
  if (h.kind === 'broken' && h.runs === 1)
    return `Failed its latest run${h.since.sha ? `, on commit ${short(h.since.sha)}` : ''}.`
  if (h.kind === 'broken')
    return `Failing on its last ${h.runs} runs${h.since.sha ? `, since commit ${short(h.since.sha)}` : ''}.`
  const r = h.reason
  if (r.type === 'same-commit')
    return `Passed and failed on the same commit ${short(r.sha)}.`
  if (r.type === 'retry')
    return `Needed a retry to pass in ${times(r.runs, 'run', 'runs')} of the last ${window}.`
  return `Flipped between pass and fail ${times(r.flips, 'time', 'times')} in the last ${window} runs.`
}
