<script setup lang="ts">
defineProps<{
  setIframe: (el: unknown) => void
  src: string
}>()

const emit = defineEmits<{
  loaded: []
}>()
</script>

<template>
  <iframe
    :ref="setIframe"
    :src="src"
    name="snapshot"
    title="DOM snapshot"
    sandbox="allow-same-origin allow-scripts"
    class="absolute inset-0 size-full border-0"
    @load="emit('loaded')"
  />
</template>
