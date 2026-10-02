<script setup lang="ts">
import { asLocatorDescription } from '@isomorphic/locatorGenerators'
import { Check, Copy } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useTraceStore } from '../store'

const store = useTraceStore()
const copied = ref(false)

const selector = computed(() => {
  if (store.pickedLocator.value)
    return store.pickedLocator.value.selector
  const params = store.selectedAction.value?.params ?? {}
  const value = params.selector ?? params.locator?.selector
  return typeof value === 'string' ? value : ''
})

const locator = computed(() => {
  if (store.pickedLocator.value)
    return store.pickedLocator.value.locator
  if (!selector.value)
    return ''
  try {
    return asLocatorDescription(store.model.value?.sdkLanguage ?? 'javascript', selector.value)
  }
  catch {
    return ''
  }
})

async function copyLocator(): Promise<void> {
  if (!locator.value)
    return
  await navigator.clipboard.writeText(locator.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div class="h-full overflow-auto p-3">
    <div v-if="!selector" class="flex h-full items-center justify-center text-sm text-muted-foreground">
      No locator for this action
    </div>
    <div v-else class="flex max-w-3xl flex-col gap-4">
      <section>
        <div class="mb-1.5 flex items-center gap-2">
          <h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Locator
          </h3>
          <button
            v-if="locator"
            type="button"
            class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-signal/50 hover:text-foreground"
            @click="copyLocator"
          >
            <component :is="copied ? Check : Copy" class="size-3.5" />
            {{ copied ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <pre class="overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs text-foreground/90">{{ locator || selector }}</pre>
      </section>

      <section>
        <h3 class="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Raw selector
        </h3>
        <pre class="overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs text-foreground/90">{{ selector }}</pre>
      </section>
    </div>
  </div>
</template>
