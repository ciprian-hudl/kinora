import type { RunSummary } from '@kinora/core'
import { describe, expect, it } from 'vitest'
import { matchScore, queryTerms, rankByQuery, runKeywords, runMatches, runRef } from './palette'

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 'run-1',
    projectId: 'web',
    startedAt: '2026-10-01T10:00:00.000Z',
    duration: 1000,
    counts: { total: 1, expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
    reportPath: 'reports/web/run-1.json',
    countsByTag: {},
    ...overrides,
  }
}

describe('queryTerms', () => {
  it('splits on whitespace and lowercases', () => {
    expect(queryTerms('  Web   TESTS ')).toEqual(['web', 'tests'])
    expect(queryTerms('   ')).toEqual([])
  })
})

describe('matchScore', () => {
  it('needs every word, in any order', () => {
    expect(matchScore(['settings', 'work'], 'Workspace settings')).toBeGreaterThan(0)
    expect(matchScore(['settings', 'billing'], 'Workspace settings')).toBe(0)
  })

  it('finds a word in the keywords when the label lacks it', () => {
    expect(matchScore(['billing'], 'Workspace settings', 'members billing tokens')).toBeGreaterThan(0)
  })

  it('prefers the start of the label, then the start of a word, then anywhere', () => {
    const start = matchScore(['set'], 'Settings')
    const word = matchScore(['set'], 'Account settings')
    const inside = matchScore(['set'], 'Reset password')
    const keyword = matchScore(['set'], 'Preferences', 'settings')
    expect(start).toBeGreaterThan(word)
    expect(word).toBeGreaterThan(inside)
    expect(inside).toBeGreaterThan(keyword)
  })
})

describe('rankByQuery', () => {
  it('drops what does not match and keeps the order of equal matches', () => {
    const items = [{ label: 'Reset password' }, { label: 'Account settings' }, { label: 'Overview' }, { label: 'Workspace settings' }]
    expect(rankByQuery(items, ['set']).map(i => i.label)).toEqual(['Account settings', 'Workspace settings', 'Reset password'])
  })
})

describe('runKeywords', () => {
  it('covers the branch, the full sha, the CI run number and the run id', () => {
    const keywords = runKeywords(run({ git: { branch: 'feat/cart', sha: '1a2b3c4d5e6f' }, ci: { runNumber: '482' } }))
    for (const term of ['feat/cart', '1a2b3c4d5e6f', '#482', 'run-1'])
      expect(keywords).toContain(term)
  })
})

describe('runMatches', () => {
  const r = run({ git: { branch: 'feat/cart', sha: '1a2b3c4d5e6f' } })

  it('matches on the run fields, narrowed by the project name', () => {
    expect(runMatches(['1a2b'], r, 'Web app')).toBe(true)
    expect(runMatches(['cart', 'web'], r, 'Web app')).toBe(true)
    expect(runMatches(['cart', 'admin'], r, 'Web app')).toBe(false)
  })

  it('does not match on the project name alone', () => {
    expect(runMatches(['web'], r, 'Web app')).toBe(false)
  })
})

describe('runRef', () => {
  it('joins the branch and the short sha, or keeps the one that exists', () => {
    expect(runRef(run({ git: { branch: 'main', sha: '1a2b3c4d5e6f' } }))).toBe('main @ 1a2b3c4')
    expect(runRef(run({ git: { branch: 'main' } }))).toBe('main')
    expect(runRef(run())).toBeUndefined()
  })
})
