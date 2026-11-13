import { describe, expect, it } from 'vitest'
import { rankOptions } from './rank-options'

describe('rankOptions', () => {
  const branches = ['gh-readonly-queue/main/pr-1', 'changesets-domain-types', 'main', 'feature/x']

  it('puts the exact match first and keeps the given order after it', () => {
    expect(rankOptions(branches, 'main')).toEqual(['main', 'gh-readonly-queue/main/pr-1', 'changesets-domain-types'])
  })

  it('ignores case and surrounding space', () => {
    expect(rankOptions(branches, ' MAIN ')[0]).toBe('main')
  })

  it('keeps every option without a search', () => {
    expect(rankOptions(branches, '')).toBe(branches)
  })
})
