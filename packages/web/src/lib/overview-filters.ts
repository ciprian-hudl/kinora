import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import { PROJECT_VIEWS } from '@kinora/core'

export interface OverviewFilters {
  view: string
  branch: string
  tag: string
}

export const NO_FILTERS: OverviewFilters = { view: 'all', branch: 'all', tag: 'all' }

export const FILTER_KEYS = ['view', 'branch', 'tag'] as const

export function sameFilters(a: OverviewFilters, b: OverviewFilters): boolean {
  return a.view === b.view && a.branch === b.branch && a.tag === b.tag
}

function first(v: LocationQuery[string]): string | undefined {
  return (Array.isArray(v) ? v[0] : v) ?? undefined
}

export function filtersFromQuery(query: LocationQuery): OverviewFilters {
  const view = first(query.view)?.toLowerCase()
  return {
    view: PROJECT_VIEWS.find(v => v.id === view)?.id ?? 'all',
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
