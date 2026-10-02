<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocatorPicker } from '../lib/useLocatorPicker'
import { useTraceStore } from '../store'
import AriaSnapshotView from './AriaSnapshotView.vue'
import DomSnapshotView from './DomSnapshotView.vue'
import SnapshotToolbar from './SnapshotToolbar.vue'
import TextTooltip from './TextTooltip.vue'

type SnapshotMode = 'dom' | 'aria'

const store = useTraceStore()
const mode = ref<SnapshotMode>('dom')
const viewport = computed(() => store.snapshotInfo.value.viewport)
const pageUrl = computed(() => store.snapshotInfo.value.url ?? '')
const frameSrc = computed(() => store.currentSnapshotUrl.value ?? 'about:blank')
const hasSnapshot = computed(() => !!store.currentSnapshotUrl.value)
const ariaUrl = computed(() => {
  const snapshot = store.currentSnapshot.value
  const model = store.model.value
  if (!snapshot || !model)
    return undefined
  const event = model.ariaSnapshotForCall(snapshot.callId, snapshot.phase)
  return event?.file ? model.createRelativeUrl(`file/${event.file}`) : undefined
})

const { installInspector, setIframe } = useLocatorPicker(frameSrc)

function openSnapshot(): void {
  if (store.currentSnapshotUrl.value)
    window.open(store.currentSnapshotUrl.value, '_blank', 'noopener,noreferrer')
}

function toggleInspector(): void {
  mode.value = 'dom'
  store.setInspectingLocator(!store.inspectingLocator.value)
}

watch(frameSrc, () => {
  void store.refreshSnapshotInfo()
}, { immediate: true })
</script>

<template>
  <div class="flex h-full flex-col bg-background">
    <SnapshotToolbar
      :mode="mode"
      :selected-tab="store.snapshotTab.value"
      :has-snapshot="hasSnapshot"
      :inspecting="store.inspectingLocator.value"
      :viewport="viewport"
      @set-tab="store.setTab"
      @set-mode="value => mode = value"
      @toggle-inspector="toggleInspector"
      @open-snapshot="openSnapshot"
    />

    <div class="flex min-h-0 flex-1 flex-col p-3">
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-black/40">
        <div class="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3">
          <div class="flex gap-1.5">
            <span class="size-2.5 rounded-full bg-fail/70" />
            <span class="size-2.5 rounded-full bg-flaky/70" />
            <span class="size-2.5 rounded-full bg-pass/70" />
          </div>
          <div class="ml-1 flex h-5 min-w-0 flex-1 items-center rounded-md border border-border/70 bg-background/60 px-2.5">
            <TextTooltip :text="pageUrl || 'about:blank'" class="font-mono text-[11px] text-muted-foreground" />
          </div>
        </div>
        <div class="relative min-h-0 flex-1 bg-white">
          <DomSnapshotView
            v-if="mode === 'dom'"
            :set-iframe="setIframe"
            :src="frameSrc"
            @loaded="installInspector"
          />
          <AriaSnapshotView v-else :url="ariaUrl" />
        </div>
      </div>
    </div>
  </div>
</template>
