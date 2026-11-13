import type { OverviewFilters, OverviewView } from '@/lib/overview-filters'
import { useLocalStorage } from '@vueuse/core'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FILTER_KEYS, filtersFromQuery, filtersToQuery, first, NO_FILTERS, sameFilters, viewSlug } from '@/lib/overview-filters'

// A link with filters wins; without one the overview reopens with the filters last used.
export function useOverviewFilters() {
  const route = useRoute()
  const router = useRouter()
  const last = useLocalStorage<OverviewFilters>('kinora:overview:filters', NO_FILTERS, { mergeDefaults: true })
  const views = useLocalStorage<OverviewView[]>('kinora:overview:views', [])

  const activeView = computed(() => views.value.find(v => sameFilters(v, last.value)))

  function apply(f: OverviewFilters, view?: string) {
    last.value = { project: f.project, branch: f.branch, tag: f.tag }
    const { view: _view, project: _project, branch: _branch, tag: _tag, ...rest } = route.query
    void router.replace({ query: { ...rest, ...filtersToQuery(f, view) } })
  }

  function saveView(name: string, f: OverviewFilters) {
    const { project, branch, tag } = f
    views.value = [...views.value.filter(v => v.name !== name), { name, project, branch, tag }]
  }

  // Back/forward and pasted links change the URL under the page.
  watch(() => route.query, (query) => {
    if (FILTER_KEYS.some(k => k in query) && !sameFilters(filtersFromQuery(query), last.value))
      last.value = filtersFromQuery(query)
  }, { immediate: true })

  // A view's link carries its filters, so opening it saves the view; a bare `?view=` opens a saved one.
  const linked = viewSlug(first(route.query.view) ?? '')
  const known = views.value.find(v => v.name === linked)
  if (linked && FILTER_KEYS.some(k => k in route.query))
    saveView(linked, last.value)
  else if (known)
    apply(known, known.name)
  else if (!sameFilters(last.value, NO_FILTERS))
    apply(last.value, activeView.value?.name)

  return {
    filters: computed(() => last.value),
    apply,
    views,
    activeView,
    selectView: (view: OverviewView) => apply(view, view.name),
    saveView: (name: string) => {
      saveView(name, last.value)
      apply(last.value, name)
    },
    deleteView: (name: string) => {
      views.value = views.value.filter(v => v.name !== name)
    },
  }
}
