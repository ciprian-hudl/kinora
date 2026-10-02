<script setup lang="ts">
import type { SnapshotTab } from '../lib/snapshots'
import type { PickedLocator } from '../store'
import { cn } from '@kinora/ui'
import { ExternalLink, Monitor, Target } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, watch } from 'vue'
import { useTraceStore } from '../store'
import TextTooltip from './TextTooltip.vue'

const store = useTraceStore()

const tabs: { id: SnapshotTab, label: string }[] = [
  { id: 'before', label: 'Before' },
  { id: 'action', label: 'Action' },
  { id: 'after', label: 'After' },
]

const viewport = computed(() => store.snapshotInfo.value.viewport)
const pageUrl = computed(() => store.snapshotInfo.value.url ?? '')
const frameSrc = computed(() => store.currentSnapshotUrl.value ?? 'about:blank')
let iframe: HTMLIFrameElement | null = null
let cleanupInspector: (() => void) | undefined

function openSnapshot(): void {
  if (store.currentSnapshotUrl.value)
    window.open(store.currentSnapshotUrl.value, '_blank', 'noopener,noreferrer')
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, `\\'`)}'`
}

function cssEscape(value: string): string {
  return window.CSS?.escape?.(value) ?? value.replace(/[^\w-]/g, match => `\\${match}`)
}

function attrSelector(name: string, value: string): string {
  return `[${name}=${JSON.stringify(value)}]`
}

function uniqueSelector(element: Element): string {
  const id = element.getAttribute('id')
  if (id)
    return `#${cssEscape(id)}`

  const testIdName = store.model.value?.testIdAttributeName ?? 'data-testid'
  const testId = element.getAttribute(testIdName)
  if (testId)
    return attrSelector(testIdName, testId)

  for (const name of ['name', 'aria-label', 'placeholder', 'alt', 'title']) {
    const value = element.getAttribute(name)
    if (value)
      return `${element.tagName.toLowerCase()}${attrSelector(name, value)}`
  }

  const parts: string[] = []
  let current: Element | null = element
  while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName.toLowerCase() !== 'html') {
    const currentElement: Element = current
    const parent: Element | null = currentElement.parentElement
    let part = currentElement.tagName.toLowerCase()
    if (parent) {
      const siblings = [...parent.children].filter(child => child.tagName === currentElement.tagName)
      if (siblings.length > 1)
        part += `:nth-of-type(${siblings.indexOf(currentElement) + 1})`
    }
    parts.unshift(part)
    if (part === 'body')
      break
    current = parent
  }
  return parts.join(' > ')
}

function pickedLocator(element: Element): PickedLocator {
  const selector = uniqueSelector(element)
  const testIdName = store.model.value?.testIdAttributeName ?? 'data-testid'
  const testId = element.getAttribute(testIdName)
  const placeholder = element.getAttribute('placeholder')
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
  const tag = element.tagName.toLowerCase()
  const role = tag === 'button' ? 'button' : element.getAttribute('role')
  const locator = testId
    ? `getByTestId(${quote(testId)})`
    : placeholder
      ? `getByPlaceholder(${quote(placeholder)})`
      : role && text
        ? `getByRole(${quote(role)}, { name: ${quote(text)} })`
        : text && text.length <= 80
          ? `getByText(${quote(text)})`
          : `locator(${quote(selector)})`
  return { selector, locator }
}

function installInspector(): void {
  cleanupInspector?.()
  cleanupInspector = undefined
  if (!store.inspectingLocator.value || !iframe)
    return

  const doc = iframe.contentDocument
  if (!doc?.body)
    return

  const previousCursor = doc.body.style.cursor
  doc.body.style.cursor = 'crosshair'

  const overlay = doc.createElement('div')
  overlay.dataset.kinoraInspectorOverlay = 'true'
  Object.assign(overlay.style, {
    position: 'fixed',
    display: 'none',
    pointerEvents: 'none',
    zIndex: '2147483647',
    border: '2px solid #f59e0b',
    background: 'rgba(245, 158, 11, 0.14)',
    borderRadius: '3px',
    boxSizing: 'border-box',
  })
  doc.body.append(overlay)

  function targetFor(event: MouseEvent): Element | null {
    const target = doc!.elementFromPoint(event.clientX, event.clientY)
    if (!target || target === overlay || target.closest('[data-kinora-inspector-overlay]'))
      return null
    return target
  }

  function onMove(event: MouseEvent): void {
    const target = targetFor(event)
    if (!target) {
      overlay.style.display = 'none'
      return
    }
    const rect = target.getBoundingClientRect()
    Object.assign(overlay.style, {
      display: 'block',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
  }

  function onClick(event: MouseEvent): void {
    const target = targetFor(event)
    if (!target)
      return
    event.preventDefault()
    event.stopPropagation()
    store.pickLocator(pickedLocator(target))
  }

  doc.addEventListener('mousemove', onMove, true)
  doc.addEventListener('click', onClick, true)
  cleanupInspector = () => {
    doc.removeEventListener('mousemove', onMove, true)
    doc.removeEventListener('click', onClick, true)
    doc.body.style.cursor = previousCursor
    overlay.remove()
  }
}

function setIframe(el: unknown): void {
  iframe = el instanceof HTMLIFrameElement ? el : null
}

watch(frameSrc, () => {
  void store.refreshSnapshotInfo()
}, { immediate: true })

watch([() => store.inspectingLocator.value, frameSrc], () => {
  void nextTick(installInspector)
})

onBeforeUnmount(() => cleanupInspector?.())
</script>

<template>
  <div class="flex h-full flex-col bg-background">
    <!-- snapshot tabs + viewport -->
    <div class="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
      <div class="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          :class="cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            store.snapshotTab.value === t.id
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )"
          @click="store.setTab(t.id)"
        >
          {{ t.label }}
        </button>
      </div>
      <div class="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <Monitor class="size-3.5" />
        <span v-if="viewport" class="font-mono tabular-nums">{{ viewport.width }}×{{ viewport.height }}</span>
        <button
          type="button"
          :class="cn(
            'flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-30',
            store.inspectingLocator.value ? 'bg-signal/15 text-signal' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )"
          title="Pick locator"
          :disabled="!store.currentSnapshotUrl.value"
          @click="store.setInspectingLocator(!store.inspectingLocator.value)"
        >
          <Target class="size-3.5" />
        </button>
        <button
          type="button"
          class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
          title="Open snapshot in new tab"
          :disabled="!store.currentSnapshotUrl.value"
          @click="openSnapshot"
        >
          <ExternalLink class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- browser chrome + page -->
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
          <iframe
            :ref="setIframe"
            :src="frameSrc"
            name="snapshot"
            title="DOM snapshot"
            sandbox="allow-same-origin allow-scripts"
            class="absolute inset-0 size-full border-0"
            @load="installInspector"
          />
        </div>
      </div>
    </div>
  </div>
</template>
