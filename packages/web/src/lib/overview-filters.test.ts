import { describe, expect, it } from 'vitest'
import { filtersFromQuery, filtersToQuery, NO_FILTERS, projectMatcher, sameFilters, viewMatcher } from './overview-filters'

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

describe('viewMatcher', () => {
  const ids = ['hudl/hudl-ui', 'fan/e2e', 'canary-tests/prod']

  it('splits marvel from hudl-frontends, and all keeps every project', () => {
    expect(ids.filter(viewMatcher('marvel'))).toEqual(['hudl/hudl-ui'])
    expect(ids.filter(viewMatcher('hudl-frontends'))).toEqual(['fan/e2e'])
    expect(ids.filter(viewMatcher('all'))).toEqual(ids)
  })
})

describe('sameFilters', () => {
  it('compares every filter', () => {
    const a = { view: 'marvel', branch: 'main', tag: 'all' }
    expect(sameFilters(a, { ...a })).toBe(true)
    expect(sameFilters(a, { ...a, view: 'all' })).toBe(false)
    expect(sameFilters(a, { ...a, branch: 'all' })).toBe(false)
  })
})

describe('filtersFromQuery / filtersToQuery', () => {
  it('round-trips through the url, leaving the defaults out', () => {
    const f = { view: 'marvel', branch: 'main', tag: '@smoke' }
    const query = filtersToQuery(f)
    expect(query).toEqual({ view: 'marvel', branch: 'main', tag: '@smoke' })
    expect(filtersFromQuery(query as never)).toEqual(f)
    expect(filtersToQuery(NO_FILTERS)).toEqual({ view: undefined, branch: undefined, tag: undefined })
  })

  it('reads a view case-insensitively and drops an unknown one', () => {
    expect(filtersFromQuery({ view: 'Marvel' }).view).toBe('marvel')
    expect(filtersFromQuery({ view: 'nope' })).toEqual(NO_FILTERS)
    expect(filtersFromQuery({})).toEqual(NO_FILTERS)
  })
})
