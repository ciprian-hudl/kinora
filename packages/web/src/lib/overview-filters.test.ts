import { describe, expect, it } from 'vitest'
import { filtersFromQuery, filtersToQuery, inView, NO_FILTERS, sameFilters, squadOptions } from './overview-filters'

describe('sameFilters', () => {
  it('compares every filter', () => {
    const a = { view: 'marvel', squad: 'Mandalorians', branch: 'main', tag: 'all' }
    expect(sameFilters(a, { ...a })).toBe(true)
    expect(sameFilters(a, { ...a, view: 'all' })).toBe(false)
    expect(sameFilters(a, { ...a, squad: 'all' })).toBe(false)
    expect(sameFilters(a, { ...a, branch: 'all' })).toBe(false)
  })
})

describe('filtersFromQuery / filtersToQuery', () => {
  it('round-trips through the url, leaving the defaults out', () => {
    const f = { view: 'mine', squad: 'Mandalorians', branch: 'main', tag: '@smoke' }
    const query = filtersToQuery(f)
    expect(query).toEqual({ view: 'mine', squad: 'Mandalorians', branch: 'main', tag: '@smoke' })
    expect(filtersFromQuery(query as never)).toEqual(f)
    expect(filtersToQuery(NO_FILTERS)).toEqual({ view: undefined, squad: undefined, branch: undefined, tag: undefined })
  })

  it('reads a view case-insensitively and drops an unknown one', () => {
    expect(filtersFromQuery({ view: 'Marvel' }).view).toBe('marvel')
    expect(filtersFromQuery({ view: 'nope' })).toEqual(NO_FILTERS)
    expect(filtersFromQuery({})).toEqual(NO_FILTERS)
  })
})

describe('inView', () => {
  const projects = [
    { id: 'hudl/hudl-ui', owner: { squad: 'Mandalorians', mine: true } },
    { id: 'fan/e2e', owner: { squad: 'Fan Team 6', mine: false } },
    { id: 'watch/e2e' },
  ]
  const ids = (view: string, squad = 'all') => projects.filter(inView(view, squad)).map(p => p.id)

  it('keeps the viewer\'s projects under mine', () => {
    expect(ids('mine')).toEqual(['hudl/hudl-ui'])
  })

  it('narrows a view to one squad, or to the projects with no known owner', () => {
    expect(ids('all', 'Fan Team 6')).toEqual(['fan/e2e'])
    expect(ids('hudl-frontends', 'other')).toEqual(['watch/e2e'])
    expect(ids('marvel')).toEqual(['hudl/hudl-ui'])
  })
})

describe('squadOptions', () => {
  it('lists the known squads by how many projects they own, then other', () => {
    const owned = (squad: string) => ({ owner: { squad, mine: false } })
    expect(squadOptions([owned('B'), owned('A'), owned('B'), {}])).toEqual(['B', 'A', 'other'])
    expect(squadOptions([owned('A')])).toEqual(['A'])
  })
})
