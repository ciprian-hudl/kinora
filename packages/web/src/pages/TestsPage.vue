<script setup lang="ts">
import type { TestHealth, TestHistory, WindowStats } from '@kinora/core'
import { diagnose, formatPct, HEALTH_WINDOW, RECENT_WINDOW, windowStats } from '@kinora/core'
import { Badge } from '@kinora/ui/badge'
import { Button } from '@kinora/ui/button'
import { Separator } from '@kinora/ui/separator'
import { Skeleton } from '@kinora/ui/skeleton'
import { StatBlock } from '@kinora/ui/stat-block'
import { ArrowLeft } from '@lucide/vue'
import { useRouteQuery } from '@vueuse/router'
import { computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import A11yBadge from '@/components/a11y/A11yBadge.vue'
import A11yHotspots from '@/components/a11y/A11yHotspots.vue'
import CopyLinkButton from '@/components/app/CopyLinkButton.vue'
import ErrorState from '@/components/app/ErrorState.vue'
import ListPagination from '@/components/app/ListPagination.vue'
import SearchInput from '@/components/app/SearchInput.vue'
import FailureCausesCard from '@/components/project/FailureCausesCard.vue'
import StatusTimeline from '@/components/viz/StatusTimeline.vue'
import TestHealthBadge from '@/components/viz/TestHealthBadge.vue'
import TestStatusBadge from '@/components/viz/TestStatusBadge.vue'
import { useProjectHistory } from '@/composables/queries'
import { matchesHealth, useHealthFilter } from '@/composables/useHealthFilter'
import { useQuarantine } from '@/composables/useQuarantine'
import { useUrlPage } from '@/composables/useUrlPage'
import { testLabel } from '@/lib/test-display'

const props = defineProps<{ projectId: string }>()
const { state, isLoading, error, execute: reloadHistory } = useProjectHistory(props.projectId)
const { byKey: quarantineByKey, isQuarantined, reload: reloadQuarantines } = useQuarantine(props.projectId)
// Quarantines fail with the same outage as the history, so a retry reloads both.
function retry() {
  void reloadHistory()
  void reloadQuarantines()
}

const project = computed(() => state.value.project)
const histories = computed(() => state.value.histories)
const clusters = computed(() => state.value.clusters)
const quarantinedCount = computed(() => quarantineByKey.value.size)

const search = useRouteQuery<string>('q', '')
// Lands on what needs a look: the flaky and the broken tests.
const filter = useHealthFilter('attention')
const a11yOnly = useRouteQuery<string, boolean>('a11y', 'false', {
  transform: {
    get: v => v === 'true',
    set: v => (v ? 'true' : 'false'),
  },
})

// Accessibility checks (axe scans attached to a test, or Storybook's a11y addon). Stories have
// their own hotspots on the Components page; here tests group by file.
const hasA11yIssues = (h: TestHistory): boolean => !!h.a11y?.violations.length
const a11yCount = computed(() => histories.value.filter(hasA11yIssues).length)
const checksA11y = computed(() => histories.value.some(h => h.a11y))
const a11yGroups = computed(() => {
  const byFile = new Map<string, TestHistory[]>()
  for (const h of histories.value.filter(hasA11yIssues))
    byFile.set(h.file, [...(byFile.get(h.file) ?? []), h])
  return [...byFile].map(([file, tests]) => ({ key: file, name: file, violations: tests.flatMap(t => t.a11y!.violations) }))
})
// A hotspot opens the tests of its file that break a rule, whatever their health.
function showA11yOf(file: string): void {
  search.value = file
  a11yOnly.value = true
  filter.value = 'all'
}

// Everything on this page reads the same window as the timeline: the last WINDOW runs. Rates,
// flaky / broken and the sort all derive from it, so the numbers match the bars.
const WINDOW = HEALTH_WINDOW

const statsByKey = computed(() => new Map(histories.value.map(h => [h.testKey, windowStats(h.points)])))
function stats(h: TestHistory): WindowStats {
  return statsByKey.value.get(h.testKey) ?? windowStats([])
}
const healthByKey = computed(() => new Map(histories.value.map(h => [h.testKey, diagnose(h.points)])))
function health(h: TestHistory): TestHealth {
  return healthByKey.value.get(h.testKey) ?? { kind: 'stable' }
}

// "New failure" is gated on the test still failing now, so a recovered (green) test isn't badged.
const isNewFailure = (h: TestHistory): boolean => h.newlyBroken && h.lastStatus === 'unexpected'

const flakyCount = computed(() => histories.value.filter(h => health(h).kind === 'flaky').length)
const brokenCount = computed(() => histories.value.filter(h => health(h).kind === 'broken').length)
const newlyFlakyCount = computed(() => histories.value.filter(h => h.newlyFlaky).length)
const newlyBrokenCount = computed(() => histories.value.filter(h => isNewFailure(h)).length)

// Fresh breaks first (same gating as the badge), then broken before flaky, then by recent
// instability over the window.
function rank(h: TestHistory): number {
  if (isNewFailure(h))
    return 4
  if (h.newlyFlaky)
    return 3
  return health(h).kind === 'broken' ? 2 : health(h).kind === 'flaky' ? 1 : 0
}
const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return histories.value
    .filter(h => matchesHealth(filter.value, health(h), isQuarantined(h.testKey)) && (!a11yOnly.value || hasA11yIssues(h)))
    .filter(
      h =>
        !q
        || h.titlePath.join(' ').toLowerCase().includes(q)
        || h.file.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const r = rank(b) - rank(a)
      if (r)
        return r
      return (stats(b).failRate * 2 + stats(b).flakyRate) - (stats(a).failRate * 2 + stats(a).flakyRate)
    })
})

const PAGE_SIZE = 25

const { pageIndex, currentPage, setPage } = useUrlPage(() => rows.value.length, PAGE_SIZE)
const paged = computed(() => rows.value.slice(pageIndex.value * PAGE_SIZE, pageIndex.value * PAGE_SIZE + PAGE_SIZE))

// A changed filter should land on page 1, not a stale (clamped) page.
watch([search, filter, a11yOnly], () => setPage(1))

const FILTERS = [
  { value: 'all', label: 'All tests', active: 'border-foreground/30 text-foreground' },
  { value: 'attention', label: 'Needs attention', active: 'border-flaky/50 text-flaky hover:text-flaky' },
  { value: 'flaky', label: 'Flaky', active: 'border-flaky/50 text-flaky hover:text-flaky' },
  { value: 'broken', label: 'Broken', active: 'border-fail/50 text-fail hover:text-fail' },
] as const

const EMPTY = {
  all: 'No tests match this filter.',
  attention: 'No flaky or broken tests. All green.',
  flaky: 'No flaky tests.',
  broken: 'No broken tests.',
  quarantined: 'No quarantined tests.',
} as const
</script>

<template>
  <div class="flex flex-col gap-8">
    <RouterLink
      :to="{ name: 'project', params: { projectId } }"
      class="flex w-fit items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="size-3.5" /> {{ project?.name ?? projectId }}
    </RouterLink>

    <ErrorState v-if="error" :error="error" @retry="retry()" />
    <template v-else-if="isLoading">
      <Skeleton class="h-24 rounded-xl" />
      <Skeleton class="h-96 rounded-xl" />
    </template>

    <template v-else>
      <div class="flex flex-col gap-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight">
              Tests
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">
              Per-test health over the last {{ WINDOW }} runs of {{ project?.name }}. Hover a Flaky or Broken badge to see why. 'New' = started failing or flaking in the last {{ RECENT_WINDOW }}.
            </p>
          </div>
          <CopyLinkButton class="shrink-0" />
        </div>

        <div class="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-lg border border-border/70 bg-card/80 px-6 py-5">
          <StatBlock label="Tests tracked" :value="histories.length" />
          <Separator orientation="vertical" class="h-10" />
          <StatBlock label="Flaky" :value="flakyCount" :tone="flakyCount ? 'flaky' : 'pass'" />
          <Separator orientation="vertical" class="h-10" />
          <StatBlock label="Broken" :value="brokenCount" :tone="brokenCount ? 'fail' : 'pass'" />
          <Separator orientation="vertical" class="h-10" />
          <StatBlock label="New flakiness" :value="newlyFlakyCount" :tone="newlyFlakyCount ? 'flaky' : 'default'" />
          <Separator orientation="vertical" class="h-10" />
          <StatBlock label="New failures" :value="newlyBrokenCount" :tone="newlyBrokenCount ? 'fail' : 'default'" />
          <Separator orientation="vertical" class="h-10" />
          <StatBlock label="Quarantined" :value="quarantinedCount" :tone="quarantinedCount ? 'flaky' : 'default'" />
          <template v-if="checksA11y">
            <Separator orientation="vertical" class="h-10" />
            <StatBlock label="A11y issues" :value="a11yCount" :tone="a11yCount ? 'fail' : 'pass'" />
          </template>
        </div>
      </div>

      <FailureCausesCard :clusters="clusters" :histories="histories" :project-id="projectId" />

      <A11yHotspots :groups="a11yGroups" what="Test files" @select="showA11yOf" />

      <!-- Toolbar -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <Button
            v-for="f in FILTERS"
            :key="f.value"
            variant="outline"
            size="sm"
            class="font-mono text-xs"
            :class="filter === f.value ? f.active : ''"
            @click="filter = f.value"
          >
            {{ f.label }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="font-mono text-xs"
            :class="filter === 'quarantined' ? 'border-flaky/50 text-flaky hover:text-flaky' : ''"
            @click="filter = 'quarantined'"
          >
            Quarantined <span class="ml-1 tabular-nums text-muted-foreground">{{ quarantinedCount }}</span>
          </Button>
          <Button
            v-if="checksA11y"
            variant="outline"
            size="sm"
            class="font-mono text-xs"
            :class="a11yOnly ? 'border-fail/50 text-fail hover:text-fail' : ''"
            :aria-pressed="a11yOnly"
            @click="a11yOnly = !a11yOnly"
          >
            A11y issues <span class="ml-1 tabular-nums text-muted-foreground">{{ a11yCount }}</span>
          </Button>
        </div>
        <SearchInput v-model="search" placeholder="Filter by title or file..." />
      </div>

      <!-- List -->
      <div class="flex flex-col gap-2">
        <RouterLink
          v-for="h in paged"
          :key="h.testKey"
          :to="{ name: 'test', params: { projectId }, query: { key: h.testKey } }"
          class="group grid grid-cols-1 items-center gap-3 rounded-lg border border-border/70 bg-card/80 px-4 py-3 transition-colors hover:border-border sm:grid-cols-[1fr_auto] sm:gap-4"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <TestStatusBadge :status="h.lastStatus" />
              <span class="truncate text-sm font-medium">{{ testLabel(h) }}</span>
              <Badge v-if="isNewFailure(h)" class="border-fail/30 bg-fail/15 text-[10px] text-fail">
                New failure
              </Badge>
              <Badge v-else-if="h.newlyFlaky" class="border-flaky/30 bg-flaky/15 text-[10px] text-flaky">
                New flakiness
              </Badge>
              <!-- Unless a "New" badge already says the same thing. -->
              <TestHealthBadge
                v-if="!(isNewFailure(h) && health(h).kind === 'broken') && !(h.newlyFlaky && health(h).kind === 'flaky')"
                :health="health(h)"
              />
              <A11yBadge :report="h.a11y" />
              <Badge v-if="isQuarantined(h.testKey)" class="border-flaky/30 bg-flaky/10 text-[10px] text-flaky">
                Quarantined
              </Badge>
              <Badge v-for="owner in h.codeOwners" :key="owner" class="border-signal/30 bg-signal/10 text-[10px] text-signal">
                {{ owner }}
              </Badge>
            </div>
            <div class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {{ h.file }} · {{ h.projectName }}
            </div>
          </div>

          <div class="flex items-center justify-between gap-4 sm:justify-end sm:gap-6">
            <div class="hidden w-40 sm:block">
              <StatusTimeline :points="h.points" :project-id="projectId" :height="18" :link="false" :slots="WINDOW" />
            </div>
            <div class="w-14 text-right">
              <div class="font-mono text-sm tabular-nums" :class="stats(h).flakyRate ? 'text-flaky' : 'text-muted-foreground'">
                {{ formatPct(stats(h).flakyRate) }}
              </div>
              <div class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                flaky
              </div>
            </div>
            <div class="w-14 text-right">
              <div class="font-mono text-sm tabular-nums" :class="stats(h).failRate ? 'text-fail' : 'text-muted-foreground'">
                {{ formatPct(stats(h).failRate) }}
              </div>
              <div class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                fail
              </div>
            </div>
            <ChevronRight class="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
          </div>
        </RouterLink>

        <div v-if="!rows.length" class="py-12 text-center font-mono text-sm text-muted-foreground">
          {{ search ? 'No tests match this filter.' : EMPTY[filter] }}
        </div>
      </div>

      <ListPagination :total="rows.length" :page-size="PAGE_SIZE" :page="currentPage" noun="tests" @update:page="setPage" />
    </template>
  </div>
</template>
