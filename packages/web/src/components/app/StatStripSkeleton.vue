<script setup lang="ts">
import { Separator } from '@kinora/ui/separator'
import { Skeleton } from '@kinora/ui/skeleton'

withDefaults(defineProps<{
  count: number
  /** Mirrors the strips that open with a small uppercase caption (test history). */
  caption?: boolean
}>(), { caption: false })
</script>

<template>
  <div class="flex flex-col gap-3 rounded-lg border border-border/70 bg-card/80 px-6 py-5" aria-hidden="true">
    <div v-if="caption" class="flex h-[15px] items-center">
      <Skeleton class="h-2.5 w-24" />
    </div>
    <div class="flex flex-wrap items-center gap-x-10 gap-y-4">
      <template v-for="i in count" :key="i">
        <Separator v-if="i > 1" orientation="vertical" class="h-10" />
        <!-- Same line boxes as StatBlock: a 10px label (15px line) over a leading-none 2xl value. -->
        <div class="flex flex-col gap-1">
          <div class="flex h-[15px] items-center">
            <Skeleton class="h-2.5 w-16" />
          </div>
          <Skeleton class="h-6 w-14" />
        </div>
      </template>
    </div>
  </div>
</template>
