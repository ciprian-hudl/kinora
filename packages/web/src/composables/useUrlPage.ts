import type { MaybeRefOrGetter } from 'vue'
import { useRouteQuery } from '@vueuse/router'
import { computed, toValue } from 'vue'

// Page lives in the URL (?page=N) like the app's other view state; null = page 1 (clean URL).
// An out-of-range page (a shared link to a list that has since shrunk) clamps to the last one.
export function useUrlPage(total: MaybeRefOrGetter<number>, pageSize: number) {
  const page = useRouteQuery<string | null>('page', null)
  const pageCount = computed(() => Math.max(1, Math.ceil(toValue(total) / pageSize)))
  const pageIndex = computed(() => {
    const n = Math.floor(Number(page.value))
    if (!page.value || !Number.isFinite(n) || n < 1)
      return 0
    return Math.min(n - 1, pageCount.value - 1)
  })
  const currentPage = computed(() => pageIndex.value + 1)

  function setPage(p: number) {
    page.value = p > 1 ? String(p) : null
  }

  return { pageIndex, currentPage, setPage }
}
