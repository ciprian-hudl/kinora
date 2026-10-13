import type { TestHealth } from '@kinora/core'
import { useRouteQuery } from '@vueuse/router'
import { useRoute, useRouter } from 'vue-router'

// Which tests (or stories) a list shows, kept in the URL as `?show=`. "attention" is flaky or broken.
export type HealthFilter = 'all' | 'attention' | 'flaky' | 'broken' | 'quarantined'
const FILTERS: HealthFilter[] = ['all', 'attention', 'flaky', 'broken', 'quarantined']

export function matchesHealth(filter: HealthFilter, health: TestHealth, quarantined = false): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'attention':
      return health.kind !== 'stable'
    case 'quarantined':
      return quarantined
    default:
      return health.kind === filter
  }
}

// Shared links from before Flaky / Broken used `?unstable=` and `?quarantined=`: read them once,
// then drop them for `?show=`.
function legacyFilter(query: Record<string, unknown>): HealthFilter | undefined {
  if (query.quarantined === 'true')
    return 'quarantined'
  if (query.unstable === 'true')
    return 'attention'
  if (query.unstable === 'false')
    return 'all'
  return undefined
}

export function useHealthFilter(fallback: HealthFilter) {
  const route = useRoute()
  const router = useRouter()
  const legacy = legacyFilter(route.query)
  if ('unstable' in route.query || 'quarantined' in route.query) {
    const { unstable: _unstable, quarantined: _quarantined, ...query } = route.query
    void router.replace({ query: legacy ? { ...query, show: legacy } : query })
  }
  return useRouteQuery<string, HealthFilter>('show', legacy ?? fallback, {
    transform: {
      get: v => (FILTERS.includes(v as HealthFilter) ? v as HealthFilter : fallback),
      set: v => v,
    },
  })
}
