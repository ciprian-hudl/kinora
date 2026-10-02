<script setup lang="ts">
import { cn } from '@kinora/ui'
import { Copy } from '@lucide/vue'
import { computed } from 'vue'
import { callSummary } from '../lib/call'
import { useTraceStore } from '../store'

const store = useTraceStore()

const summary = computed(() => {
  const action = store.selectedAction.value
  return action ? callSummary(action) : null
})

const allParamsText = computed(() => JSON.stringify(store.selectedAction.value?.params ?? {}, null, 2))

function copyParams(): void {
  void navigator.clipboard.writeText(allParamsText.value)
}

const statusClass = computed(() => {
  if (summary.value?.statusTone === 'error')
    return 'border-fail/30 bg-fail/10 text-fail'
  if (summary.value?.statusTone === 'muted')
    return 'border-border bg-muted text-muted-foreground'
  return 'border-pass/30 bg-pass/10 text-pass'
})
</script>

<template>
  <div class="h-full overflow-auto p-3">
    <div v-if="!summary" class="flex h-full items-center justify-center text-sm text-muted-foreground">
      No call selected
    </div>

    <div v-else class="space-y-4 text-xs">
      <div class="rounded-lg border border-border bg-muted/20 p-3">
        <div class="mb-2 flex items-start gap-2">
          <div class="min-w-0 flex-1">
            <div data-testid="call-title" class="truncate text-sm font-semibold text-foreground">
              {{ summary.title }}
            </div>
            <div data-testid="call-method" class="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {{ summary.subtitle }}
            </div>
          </div>
          <span :class="cn('rounded border px-1.5 py-0.5 font-mono text-[10px]', statusClass)">
            {{ summary.status }}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-muted-foreground">
          <div>
            <span class="uppercase tracking-wide">Duration</span>
            <div class="font-mono text-foreground/90">
              {{ summary.duration }}
            </div>
          </div>
          <div>
            <span class="uppercase tracking-wide">Call id</span>
            <div class="font-mono text-foreground/90">
              {{ store.selectedAction.value?.callId }}
            </div>
          </div>
        </div>
      </div>

      <section v-if="summary.error" class="rounded-md border border-fail/30 bg-fail/5 p-3 text-fail">
        <div class="mb-1 font-semibold tracking-wide uppercase">
          Error
        </div>
        <div class="whitespace-pre-wrap">
          {{ summary.error }}
        </div>
      </section>

      <section v-if="summary.primary.length">
        <div class="mb-1 font-semibold tracking-wide text-muted-foreground uppercase">
          Key details
        </div>
        <table class="w-full overflow-hidden rounded-md border border-border text-xs">
          <tbody>
            <tr v-for="row in summary.primary" :key="row.key" class="border-b border-border/40 last:border-0">
              <td class="w-36 bg-muted/30 px-2 py-1.5 align-top font-mono text-muted-foreground">
                {{ row.key }}
              </td>
              <td class="px-2 py-1.5 align-top font-mono whitespace-pre-wrap break-all text-foreground/90">
                {{ row.value }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <div class="mb-1 flex items-center gap-2">
          <span class="font-semibold tracking-wide text-muted-foreground uppercase">All params</span>
          <button
            type="button"
            class="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            @click="copyParams"
          >
            <Copy class="size-3" />
            Copy
          </button>
        </div>
        <div v-if="!summary.params.length" class="rounded-md border border-border bg-muted/20 p-2 text-muted-foreground">
          No additional params
        </div>
        <table v-else class="w-full overflow-hidden rounded-md border border-border text-xs">
          <tbody>
            <tr v-for="row in summary.params" :key="row.key" class="border-b border-border/40 last:border-0">
              <td class="w-36 bg-muted/30 px-2 py-1.5 align-top font-mono text-muted-foreground">
                {{ row.key }}
              </td>
              <td class="px-2 py-1.5 align-top font-mono whitespace-pre-wrap break-all text-foreground/90">
                {{ row.value }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="summary.result">
        <div class="mb-1 font-semibold tracking-wide text-muted-foreground uppercase">
          Result
        </div>
        <pre class="rounded-md border border-border bg-muted/20 p-2 font-mono whitespace-pre-wrap">{{ summary.result }}</pre>
      </section>
    </div>
  </div>
</template>
