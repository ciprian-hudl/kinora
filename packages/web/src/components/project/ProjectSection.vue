<script setup lang="ts">
import type { OverviewProject } from '@kinora/core'
import { ChevronDown, ChevronRight } from '@lucide/vue'
import ProjectCard from '@/components/project/ProjectCard.vue'

defineProps<{ title: string, projects: OverviewProject[], highlight?: boolean }>()
const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <section class="flex flex-col gap-4">
    <button
      type="button"
      class="flex w-fit items-center gap-1.5 font-mono text-xs"
      :class="highlight ? 'text-signal hover:text-signal/80' : 'text-muted-foreground hover:text-foreground'"
      :aria-expanded="open"
      @click="open = !open"
    >
      <component :is="open ? ChevronDown : ChevronRight" class="size-3.5 shrink-0" />
      <h2>{{ title }}</h2>
      <span class="tabular-nums" :class="highlight ? 'text-signal/70' : 'text-muted-foreground/70'">{{ projects.length }}</span>
    </button>
    <div v-if="open" class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <ProjectCard v-for="p in projects" :key="p.id" :project="p" />
    </div>
  </section>
</template>
