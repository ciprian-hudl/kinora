import { describe, expect, it } from 'vitest'
import { filtersFromQuery, filtersToQuery, NO_FILTERS, sameFilters } from './overview-filters'

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
