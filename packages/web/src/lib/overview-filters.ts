import type { LocationQuery, LocationQueryRaw } from 'vue-router'

export interface OverviewFilters {
  view: string
  branch: string
  tag: string
}

export const NO_FILTERS: OverviewFilters = { view: 'all', branch: 'all', tag: 'all' }

export const FILTER_KEYS = ['view', 'branch', 'tag'] as const

// Globs on the project id: `hudl/hudl-*` keeps those, `!hudl/hudl-*` drops them.
export const OVERVIEW_VIEWS = [
  { id: 'hudl-frontends', projects: '!hudl/hudl-* !canary-tests/*' },
  { id: 'marvel', projects: 'hudl/hudl-*' },
] as const

function glob(term: string): RegExp {
  return new RegExp(`^${term.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i')
}

export function projectMatcher(pattern: string): (id: string) => boolean {
  const terms = pattern.split(/[\s,]+/).filter(Boolean)
  const keep = terms.filter(t => !t.startsWith('!')).map(glob)
  const drop = terms.filter(t => t.length > 1 && t.startsWith('!')).map(t => glob(t.slice(1)))
  return id => (!keep.length || keep.some(re => re.test(id))) && !drop.some(re => re.test(id))
}

export function viewMatcher(view: string): (id: string) => boolean {
  return projectMatcher(OVERVIEW_VIEWS.find(v => v.id === view)?.projects ?? '')
}

export function sameFilters(a: OverviewFilters, b: OverviewFilters): boolean {
  return a.view === b.view && a.branch === b.branch && a.tag === b.tag
}

function first(v: LocationQuery[string]): string | undefined {
  return (Array.isArray(v) ? v[0] : v) ?? undefined
}

export function filtersFromQuery(query: LocationQuery): OverviewFilters {
  const view = first(query.view)?.toLowerCase()
  return {
    view: OVERVIEW_VIEWS.find(v => v.id === view)?.id ?? 'all',
    branch: first(query.branch) || 'all',
    tag: first(query.tag) || 'all',
  }
}

export function filtersToQuery(f: OverviewFilters): LocationQueryRaw {
  return {
    view: f.view === 'all' ? undefined : f.view,
    branch: f.branch === 'all' ? undefined : f.branch,
    tag: f.tag === 'all' ? undefined : f.tag,
  }
}
