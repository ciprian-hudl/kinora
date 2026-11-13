import { describe, expect, it } from 'vitest'
import { filtersFromQuery, filtersToQuery, NO_FILTERS, projectMatcher, sameFilters, viewSlug } from './overview-filters'

describe('projectMatcher', () => {
  const ids = ['hudl/hudl-ui', 'hudl/hudl-users', 'fan/e2e', 'watch/integration']
  const matching = (pattern: string) => ids.filter(projectMatcher(pattern))

  it('keeps the projects a glob matches', () => {
    expect(matching('hudl/hudl-*')).toEqual(['hudl/hudl-ui', 'hudl/hudl-users'])
    expect(matching('FAN/*, watch/*')).toEqual(['fan/e2e', 'watch/integration'])
  })

  it('drops the projects a negated glob matches', () => {
    expect(matching('!hudl/hudl-*')).toEqual(['fan/e2e', 'watch/integration'])
    expect(matching('*/e2e !fan/*')).toEqual([])
  })

  it('keeps everything without a pattern', () => {
    expect(matching('')).toEqual(ids)
    expect(matching('!')).toEqual(ids)
  })

  it('treats regex characters literally', () => {
    expect(matching('hudl.hudl-ui')).toEqual([])
  })
})

describe('viewSlug', () => {
  it('lowercases a name into its link slug', () => {
    expect(viewSlug(' Marvel ')).toBe('marvel')
    expect(viewSlug('HFE Smoke & e2e')).toBe('hfe-smoke-e2e')
  })
})

describe('sameFilters', () => {
  it('compares every filter, ignoring surrounding space', () => {
    const a = { project: 'hudl/hudl-*', branch: 'main', tag: 'all' }
    expect(sameFilters(a, { ...a, project: ' hudl/hudl-* ' })).toBe(true)
    expect(sameFilters(a, { ...a, project: '!hudl/hudl-*' })).toBe(false)
    expect(sameFilters(a, { ...a, branch: 'all' })).toBe(false)
  })
})

describe('filtersFromQuery / filtersToQuery', () => {
  it('round-trips through the url, leaving the defaults out', () => {
    const f = { project: 'hudl/hudl-*', branch: 'main', tag: '@smoke' }
    const query = filtersToQuery(f)
    expect(query).toEqual({ view: undefined, project: 'hudl/hudl-*', branch: 'main', tag: '@smoke' })
    expect(filtersFromQuery(query as never)).toEqual(f)
    expect(filtersToQuery(NO_FILTERS, 'marvel')).toEqual({ view: 'marvel', project: undefined, branch: undefined, tag: undefined })
  })

  it('falls back to no filters', () => {
    expect(filtersFromQuery({})).toEqual(NO_FILTERS)
  })
})
