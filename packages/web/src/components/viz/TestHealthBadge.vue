<script setup lang="ts">
import type { TestHealth } from '@kinora/core'
import { describeHealth } from '@kinora/core'
import { Badge } from '@kinora/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@kinora/ui/tooltip'
import { computed } from 'vue'

// Flaky or Broken, with the reason on hover. Nothing for a stable test.
const props = defineProps<{ health: TestHealth }>()

const reason = computed(() => describeHealth(props.health))
</script>

<template>
  <TooltipProvider v-if="health.kind !== 'stable'" :delay-duration="80">
    <Tooltip>
      <TooltipTrigger as-child>
        <Badge
          :data-health="health.kind"
          class="text-[10px]"
          :class="health.kind === 'broken' ? 'border-fail/30 bg-fail/15 text-fail' : 'border-flaky/30 bg-flaky/15 text-flaky'"
        >
          {{ health.kind === 'broken' ? 'Broken' : 'Flaky' }}
        </Badge>
      </TooltipTrigger>
      <TooltipContent class="max-w-64 font-mono text-xs">
        {{ reason }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
