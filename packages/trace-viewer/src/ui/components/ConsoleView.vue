<script setup lang="ts">
import type { ConsoleMessageTraceEvent } from '@trace/trace'
import { cn } from '@kinora/ui'
import { computed, ref } from 'vue'
import { inWindow } from '../lib/timeline'
import { useTraceStore } from '../store'

const store = useTraceStore()
type Scope = 'selected' | 'all'
const scope = ref<Scope>('selected')

const messages = computed(() => {
  const range = store.timeRange.value
  const source = range
    ? (store.model.value?.events ?? []).filter(e => inWindow(e.time, range))
    : scope.value === 'all'
      ? (store.model.value?.events ?? [])
      : store.selectedAction.value
        ? (store.model.value?.eventsForAction(store.selectedAction.value) ?? [])
        : []
  return source
    .filter((e): e is ConsoleMessageTraceEvent => e.type === 'console')
    .map(e => ({
      kind: e.messageType === 'error' ? 'error' : e.messageType === 'warning' ? 'warning' : 'log',
      text: e.text,
      location: e.location?.url ? `${e.location.url.split('/').pop()}:${e.location.lineNumber}` : '',
    }))
})

const emptyMessage = computed(() => {
  if (store.timeRange.value)
    return 'No console output in range'
  return scope.value === 'all' ? 'No console output in this trace' : 'No console output for this action'
})

const kindClass: Record<string, string> = {
  error: 'text-fail border-l-fail/60 bg-fail/5',
  warning: 'text-flaky border-l-flaky/60 bg-flaky/5',
  log: 'text-foreground/80 border-l-transparent',
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
      <div v-if="!store.timeRange.value" class="flex shrink-0 items-center rounded-md bg-muted/60 p-0.5">
        <button
          type="button"
          :class="cn(
            'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
            scope === 'selected' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )"
          @click="scope = 'selected'"
        >
          Selected
        </button>
        <button
          type="button"
          :class="cn(
            'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
            scope === 'all' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )"
          @click="scope = 'all'"
        >
          All
        </button>
      </div>
      <span class="ml-auto font-mono text-[11px] text-muted-foreground">{{ messages.length }}</span>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto py-1">
      <div v-if="!messages.length" class="flex h-full items-center justify-center text-sm text-muted-foreground">
        {{ emptyMessage }}
      </div>
      <div
        v-for="(msg, i) in messages"
        :key="i"
        :class="cn('flex items-start gap-3 border-l-2 px-3 py-1 font-mono text-xs', kindClass[msg.kind])"
      >
        <span class="min-w-0 flex-1 whitespace-pre-wrap break-words">{{ msg.text }}</span>
        <span v-if="msg.location" class="shrink-0 text-muted-foreground/60">{{ msg.location }}</span>
      </div>
    </div>
  </div>
</template>
