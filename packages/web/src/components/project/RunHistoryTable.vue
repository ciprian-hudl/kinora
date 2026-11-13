<script setup lang="ts">
import type { RunSort, RunSummary, SortDir } from '@kinora/core'
import { formatDuration, formatPct, passRate } from '@kinora/core'
import { Button } from '@kinora/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kinora/ui/table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ListFilter } from '@lucide/vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import FilterCombobox from '@/components/FilterCombobox.vue'
import RunHealthBadge from '@/components/viz/RunHealthBadge.vue'
import { formatDateTime } from '@/lib/format'

const props = defineProps<{ runs: RunSummary[], total: number, projectId: string, hasNewer: boolean, hasOlder: boolean, loading: boolean, branches: string[], sort: RunSort, dir: SortDir }>()
const emit = defineEmits<{ newer: [], older: [], sort: [{ sort: RunSort, dir: SortDir }] }>()

const branch = defineModel<string>('branch', { required: true })

// Newest first is the table's own order, so it shows no sort.
const sortedBy = computed(() => (props.sort === 'started' && props.dir === 'desc' ? undefined : props.sort))

// Each click goes ascending, descending, then back to newest first.
function cycleSort(col: RunSort) {
  if (sortedBy.value !== col)
    emit('sort', { sort: col, dir: 'asc' })
  else if (props.dir === 'asc')
    emit('sort', { sort: col, dir: 'desc' })
  else
    emit('sort', { sort: 'started', dir: 'desc' })
}

const router = useRouter()

// Fixed widths so filtering and sorting never reflow the columns; the branch takes the rest.
const headerCols: { id: string, label: string, right: boolean, width: string, sort?: RunSort }[] = [
  { id: 'run', label: 'Run', right: false, width: 'w-44', sort: 'started' },
  { id: 'health', label: 'Health', right: false, width: 'w-48' },
  { id: 'pass', label: 'Pass rate', right: true, width: 'w-24' },
  { id: 'fail', label: 'Failed', right: true, width: 'w-20' },
  { id: 'flaky', label: 'Flaky', right: true, width: 'w-20' },
  { id: 'duration', label: 'Duration', right: true, width: 'w-24' },
  { id: 'branch', label: 'Branch', right: false, width: '', sort: 'branch' },
  { id: 'sha', label: 'SHA', right: true, width: 'w-24' },
]
</script>

<template>
  <div class="rounded-xl border border-border/70 bg-card/80 overflow-hidden" :aria-busy="loading">
    <Table class="min-w-[56rem] table-fixed">
      <TableHeader>
        <TableRow class="hover:bg-transparent">
          <TableHead
            v-for="col in headerCols"
            :key="col.id"
            class="font-mono text-[10px] uppercase tracking-wider"
            :class="[col.width, col.right ? 'text-right' : '']"
            :aria-sort="col.sort && sortedBy === col.sort ? (dir === 'asc' ? 'ascending' : 'descending') : undefined"
          >
            <button
              v-if="col.sort"
              type="button"
              class="inline-flex items-center gap-1 uppercase hover:text-foreground"
              :class="sortedBy === col.sort ? 'text-foreground' : ''"
              @click="cycleSort(col.sort)"
            >
              {{ col.label }}
              <component :is="dir === 'asc' ? ArrowUp : ArrowDown" v-if="sortedBy === col.sort" class="size-3" />
            </button>
            <template v-else>
              {{ col.label }}
            </template>
            <FilterCombobox
              v-if="col.id === 'branch' && branches.length > 1"
              v-model="branch"
              :options="branches"
              all-label="all branches"
              search-placeholder="Search branch..."
              align="start"
            >
              <template #trigger="{ open }">
                <button
                  type="button"
                  role="combobox"
                  :aria-expanded="open"
                  aria-label="Filter by branch"
                  class="ml-2 inline-flex max-w-40 items-center gap-1 align-middle uppercase hover:text-foreground"
                  :class="branch === 'all' ? '' : 'text-signal hover:text-signal'"
                >
                  <ListFilter class="size-3 shrink-0" />
                  <span v-if="branch !== 'all'" class="truncate normal-case">{{ branch }}</span>
                </button>
              </template>
            </FilterCombobox>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow
          v-for="run in runs"
          :key="run.runId"
          class="cursor-pointer"
          @click="router.push({ name: 'run', params: { projectId, runId: run.runId } })"
        >
          <TableCell class="font-mono text-xs">
            {{ formatDateTime(run.startedAt) }}
          </TableCell>
          <TableCell><RunHealthBadge :run="run" /></TableCell>
          <TableCell class="text-right font-mono text-xs tabular-nums">
            {{ formatPct(passRate(run.counts)) }}
          </TableCell>
          <TableCell class="text-right font-mono text-xs tabular-nums" :class="run.counts.unexpected ? 'text-fail' : 'text-muted-foreground'">
            {{ run.counts.unexpected }}
          </TableCell>
          <TableCell class="text-right font-mono text-xs tabular-nums" :class="run.counts.flaky ? 'text-flaky' : 'text-muted-foreground'">
            {{ run.counts.flaky }}
          </TableCell>
          <TableCell class="text-right font-mono text-xs tabular-nums text-muted-foreground">
            {{ formatDuration(run.duration) }}
          </TableCell>
          <TableCell class="truncate font-mono text-xs text-muted-foreground" :title="run.git?.branch">
            {{ run.git?.branch ?? '-' }}
          </TableCell>
          <TableCell class="text-right font-mono text-xs text-muted-foreground">
            {{ run.git?.sha ? run.git.sha.slice(0, 7) : '-' }}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <div v-if="hasNewer || hasOlder" class="flex items-center justify-between gap-4 border-t border-border/70 px-4 py-3">
      <span class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {{ total }} runs
      </span>
      <div class="flex items-center gap-1 font-mono">
        <Button variant="ghost" size="sm" class="text-xs text-muted-foreground" :disabled="!hasNewer || loading" @click="$emit('newer')">
          <ChevronLeft class="size-3.5" /> Newer
        </Button>
        <Button variant="ghost" size="sm" class="text-xs text-muted-foreground" :disabled="!hasOlder || loading" @click="$emit('older')">
          Older <ChevronRight class="size-3.5" />
        </Button>
      </div>
    </div>
  </div>
</template>
