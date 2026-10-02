import type { ComputedRef } from 'vue'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useTraceStore } from '../store'
import { locatorForElement } from './locator'

export function useLocatorPicker(frameSrc: ComputedRef<string>) {
  const store = useTraceStore()
  const iframe = ref<HTMLIFrameElement | null>(null)
  let cleanupInspector: (() => void) | undefined

  function setIframe(el: unknown): void {
    iframe.value = el instanceof HTMLIFrameElement ? el : null
  }

  function installInspector(): void {
    cleanupInspector?.()
    cleanupInspector = undefined
    if (!store.inspectingLocator.value || !iframe.value)
      return

    const doc = iframe.value.contentDocument
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
      store.pickLocator(locatorForElement(target, store.model.value?.testIdAttributeName ?? 'data-testid'))
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

  watch([() => store.inspectingLocator.value, frameSrc], () => {
    void nextTick(installInspector)
  })

  onBeforeUnmount(() => cleanupInspector?.())

  return { installInspector, setIframe }
}
