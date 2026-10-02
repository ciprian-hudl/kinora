<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  url?: string
}>()

const text = ref('')
const loading = ref(false)

watch(() => props.url, async (url) => {
  text.value = ''
  if (!url)
    return
  loading.value = true
  try {
    const res = await fetch(url)
    text.value = res.ok ? await res.text() : ''
  }
  catch {
    text.value = ''
  }
  finally {
    loading.value = false
  }
}, { immediate: true })
</script>

<template>
  <div class="absolute inset-0 overflow-auto bg-background p-4 text-foreground">
    <div v-if="loading" class="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading ARIA snapshot…
    </div>
    <pre v-else-if="text" class="font-mono text-xs leading-relaxed whitespace-pre-wrap">{{ text }}</pre>
    <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
      No ARIA snapshot for this action
    </div>
  </div>
</template>
