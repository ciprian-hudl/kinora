<script setup lang="ts">
import type { A11yReport } from '@kinora/core'
import { byImpact } from '@kinora/core'
import { Badge } from '@kinora/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@kinora/ui/tooltip'
import { computed } from 'vue'
import { impactStyle } from './impact'

// How many accessibility rules a story breaks, colored by the most severe one; the rules on hover.
// Nothing when the check found no violation.
const props = defineProps<{ report?: A11yReport }>()

const violations = computed(() => [...(props.report?.violations ?? [])].sort(byImpact))
const label = computed(() => `${violations.value.length} a11y ${violations.value.length === 1 ? 'issue' : 'issues'}`)
</script>

<template>
  <TooltipProvider v-if="violations.length" :delay-duration="80">
    <Tooltip>
      <TooltipTrigger as-child>
        <Badge data-a11y class="text-[10px]" :class="impactStyle(violations[0].impact).class">
          {{ label }}
        </Badge>
      </TooltipTrigger>
      <TooltipContent class="max-w-72 font-mono text-xs">
        <div v-for="v in violations.slice(0, 6)" :key="v.id">
          {{ impactStyle(v.impact).label }} · {{ v.id }}
        </div>
        <div v-if="violations.length > 6" class="text-background/70">
          +{{ violations.length - 6 }} more
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
