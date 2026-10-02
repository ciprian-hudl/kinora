<script setup lang="ts">
import { computed } from 'vue'
import { useTraceStore } from '../store'

const store = useTraceStore()
const annotations = computed(() => store.model.value?.annotations ?? [])

const URL_RE = /(https?:\/\/\S+)/g

function parts(text: string): { text: string, href?: string }[] {
  return text
    .split(URL_RE)
    .filter(Boolean)
    .map(part => /^https?:\/\//i.test(part) ? { text: part, href: part } : { text: part })
}
</script>

<template>
  <div class="h-full overflow-auto p-3">
    <div v-if="!annotations.length" class="flex h-full items-center justify-center text-sm text-muted-foreground">
      No annotations
    </div>
    <div v-else class="flex flex-col gap-2">
      <div
        v-for="(annotation, i) in annotations"
        :key="`${annotation.type}-${i}`"
        class="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
      >
        <span class="font-semibold text-foreground">{{ annotation.type }}</span>
        <template v-if="annotation.description">
          <span class="text-muted-foreground">: </span>
          <template v-for="(part, j) in parts(annotation.description)" :key="j">
            <a
              v-if="part.href"
              :href="part.href"
              target="_blank"
              rel="noreferrer"
              class="break-all underline underline-offset-2 hover:text-signal"
            >{{ part.text }}</a>
            <span v-else class="text-foreground/90">{{ part.text }}</span>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>
