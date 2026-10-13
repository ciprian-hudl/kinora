<script setup lang="ts">
import type { A11yReport } from '@kinora/core'
import { byImpact } from '@kinora/core'
import { Badge } from '@kinora/ui/badge'
import { computed } from 'vue'
import { httpsUrl } from '@/lib/url'
import { impactStyle } from './impact'

// The accessibility check of a test: its violations, most severe first, each with the elements it
// hits and a link to the rule's documentation.
const props = defineProps<{ report: A11yReport }>()

const SHOWN_NODES = 3
const violations = computed(() => [...props.report.violations].sort(byImpact))
const summary = computed(() => {
  const r = props.report
  if (r.error)
    return `The accessibility check failed: ${r.error}`
  const n = `${r.violations.length} ${r.violations.length === 1 ? 'violation' : 'violations'}`
  if (r.status === 'warning')
    return `${n}, reported as ${r.violations.length === 1 ? 'a warning' : 'warnings'}: the test still passes.`
  if (r.status === 'failed')
    return `${n} failed the test.`
  return 'No violations.'
})
</script>

<template>
  <div class="flex flex-col gap-2" data-testid="a11y-violations">
    <div class="flex flex-wrap items-baseline gap-2">
      <span class="font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase">Accessibility</span>
      <span class="text-xs" :class="report.status === 'passed' ? 'text-pass' : report.status === 'failed' ? 'text-fail' : 'text-flaky'">{{ summary }}</span>
    </div>
    <ul v-if="violations.length" class="flex flex-col divide-y divide-border/50 rounded-md border border-border/70">
      <li v-for="v in violations" :key="v.id" class="flex flex-col gap-1 px-3 py-2">
        <div class="flex flex-wrap items-center gap-2">
          <Badge class="text-[10px]" :class="impactStyle(v.impact).class">
            {{ impactStyle(v.impact).label }}
          </Badge>
          <span class="text-sm">{{ v.help }}</span>
          <a
            v-if="httpsUrl(v.helpUrl)"
            :href="httpsUrl(v.helpUrl)"
            target="_blank"
            rel="noopener noreferrer"
            class="font-mono text-[11px] text-signal hover:underline"
          >{{ v.id }}</a>
          <span v-else class="font-mono text-[11px] text-muted-foreground">{{ v.id }}</span>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
          <code v-for="node in v.nodes.slice(0, SHOWN_NODES)" :key="node" class="truncate">{{ node }}</code>
          <span v-if="v.nodeCount > SHOWN_NODES">+{{ v.nodeCount - SHOWN_NODES }} more {{ v.nodeCount - SHOWN_NODES === 1 ? 'element' : 'elements' }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>
