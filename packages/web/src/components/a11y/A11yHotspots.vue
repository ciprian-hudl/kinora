<script setup lang="ts">
import type { A11yViolation } from '@kinora/core'
import { a11yScore, countByImpact } from '@kinora/core'
import { computed } from 'vue'
import { IMPACT_STYLE } from './impact'

// Groups (components, test files) ranked by the accessibility violations found in them, weighted
// by impact, with each one's mix of impacts: where fixing pays off first. A rule broken in two
// stories or tests of a group counts twice.
const props = defineProps<{
  groups: { key: string, name: string, violations: A11yViolation[] }[]
  // What a group is, for the caption: "Components ranked by ...".
  what: string
}>()
const emit = defineEmits<{ select: [key: string] }>()

const MAX_ROWS = 8
const ORDER = ['critical', 'serious', 'unknown', 'moderate', 'minor'] as const
// Bar fill per impact: the badge's text color, solid.
const FILL = { critical: 'bg-fail', serious: 'bg-signal', unknown: 'bg-fail/60', moderate: 'bg-flaky', minor: 'bg-muted-foreground/40' }

const rows = computed(() => {
  const all = props.groups
    .map(g => ({ key: g.key, name: g.name, total: g.violations.length, score: a11yScore(g.violations), counts: countByImpact(g.violations) }))
    .filter(r => r.total)
    .sort((a, b) => b.score - a.score || b.total - a.total)
  return { shown: all.slice(0, MAX_ROWS), more: Math.max(0, all.length - MAX_ROWS) }
})
const widest = computed(() => Math.max(1, ...rows.value.shown.map(r => r.total)))
</script>

<template>
  <!-- A region, not a <section> with a heading: like the other summary cards, it is not one of the
       page's component groups. -->
  <div v-if="rows.shown.length" role="region" aria-label="Accessibility hotspots" class="rounded-lg border border-border/70 bg-card/80 px-6 py-5">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <span class="font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        Accessibility hotspots
      </span>
      <div class="flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground">
        <span v-for="impact in ORDER" :key="impact" class="flex items-center gap-1">
          <span class="size-2 rounded-xs" :class="FILL[impact]" />{{ IMPACT_STYLE[impact].label }}
        </span>
      </div>
    </div>
    <p class="mt-1 text-xs text-muted-foreground">
      {{ what }} ranked by their violations, critical ones weighing the most.
    </p>
    <div class="mt-4 flex flex-col gap-2">
      <button
        v-for="r in rows.shown"
        :key="r.key"
        type="button"
        class="group grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-left sm:grid-cols-[12rem_1fr_auto]"
        @click="emit('select', r.key)"
      >
        <span class="truncate text-sm font-medium group-hover:underline" :title="r.name">{{ r.name }}</span>
        <span class="flex h-3 overflow-hidden rounded-xs bg-muted/40">
          <span
            v-for="impact in ORDER"
            :key="impact"
            :class="FILL[impact]"
            :style="{ width: `${(r.counts[impact] / widest) * 100}%` }"
            :title="`${r.counts[impact]} ${IMPACT_STYLE[impact].label.toLowerCase()}`"
          />
        </span>
        <span class="font-mono text-xs tabular-nums text-muted-foreground">{{ r.total }}</span>
      </button>
    </div>
    <p v-if="rows.more" class="mt-2 font-mono text-[10px] text-muted-foreground">
      +{{ rows.more }} more with violations
    </p>
  </div>
</template>
