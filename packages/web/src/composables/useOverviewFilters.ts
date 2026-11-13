import type { OverviewFilters } from '@/lib/overview-filters'
import { useLocalStorage } from '@vueuse/core'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FILTER_KEYS, filtersFromQuery, filtersToQuery, NO_FILTERS, sameFilters } from '@/lib/overview-filters'

// A link with filters wins; without one the overview reopens with the filters last used.
export function useOverviewFilters() {
  const route = useRoute()
  const router = useRouter()
  const last = useLocalStorage<OverviewFilters>('kinora:overview:filters', NO_FILTERS, { mergeDefaults: true })

  function apply(f: OverviewFilters) {
    last.value = { view: f.view, branch: f.branch, tag: f.tag }
    const { view: _view, branch: _branch, tag: _tag, ...rest } = route.query
    void router.replace({ query: { ...rest, ...filtersToQuery(f) } })
  }

  // Back/forward and pasted links change the URL under the page.
  watch(() => route.query, (query) => {
    if (FILTER_KEYS.some(k => k in query) && !sameFilters(filtersFromQuery(query), last.value))
      last.value = filtersFromQuery(query)
  }, { immediate: true })

  // Put the restored filters back in the URL so the page's link shares them.
  if (!FILTER_KEYS.some(k => k in route.query) && !sameFilters(last.value, NO_FILTERS))
    apply(last.value)

  return { filters: computed(() => last.value), apply }
}
