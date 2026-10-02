import type { ActionEntry, ContextEntry } from '@isomorphic/trace/entries'
import type { StackFrame } from '@trace/trace'
import type { Snapshot, SnapshotTab } from './lib/snapshots'
import type { TimeRange } from './lib/timeline'
import { buildActionTree, TraceModel } from '@isomorphic/trace/traceModel'
import { computed, ref, shallowRef } from 'vue'
import { collectSnapshots, snapshotInfoUrl, snapshotUrl } from './lib/snapshots'
import { normalizeRange } from './lib/timeline'

export interface ActionItem {
  id: string
  depth: number
  hasChildren: boolean
  action: ActionEntry
}

export interface SnapshotInfo {
  url?: string
  viewport?: { width: number, height: number }
}

export interface PickedLocator {
  selector: string
  locator: string
}

export const DETAIL_TABS = ['source', 'call', 'locator', 'log', 'network', 'attachments', 'errors', 'console', 'metadata', 'annotations'] as const
export type DetailTab = typeof DETAIL_TABS[number]

type Status = 'idle' | 'loading' | 'ready' | 'error'
type LoadErrorKind = 'generic' | 'unsupported-trace-version'

interface SourceReveal {
  stack: StackFrame[]
  version: number
}

const status = ref<Status>('idle')
const errorMessage = ref('')
const errorKind = ref<LoadErrorKind>('generic')
const traceUri = ref('')
// Display name for a trace opened from disk; remote traces show their URL instead.
const traceName = ref('')
const model = shallowRef<TraceModel | null>(null)
const items = shallowRef<ActionItem[]>([])
const collapsed = ref<Set<string>>(new Set())
const selectedId = ref<string | null>(null)
const hoveredActionId = ref<string | null>(null)
const snapshotTab = ref<SnapshotTab>('action')
const snapshotInfo = ref<SnapshotInfo>({})
const detailTab = ref<DetailTab>(initialDetailTab())
const sourceReveal = ref<SourceReveal | null>(null)
const pickedLocator = ref<PickedLocator | null>(null)
const inspectingLocator = ref(false)
const playing = ref(false)
const PLAYBACK_SPEEDS = [0.5, 1, 2] as const
const playbackSpeedIndex = ref(1)
const playbackSpeed = computed(() => PLAYBACK_SPEEDS[playbackSpeedIndex.value])
// When set, a brushed time window that filters/zooms every tab; null = follow the selected action.
const timeRange = ref<TimeRange | null>(null)
let playTimer: ReturnType<typeof setInterval> | undefined
let sourceRevealVersion = 0

function initialDetailTab(): DetailTab {
  const tab = new URLSearchParams(globalThis.location?.search ?? '').get('tab')
  return DETAIL_TABS.find(id => id === tab) ?? 'source'
}

function flatten(m: TraceModel): ActionItem[] {
  const { rootItem } = buildActionTree(m.actions)
  const out: ActionItem[] = []
  const visit = (node: typeof rootItem, depth: number): void => {
    for (const child of node.children) {
      out.push({ id: child.id, depth, hasChildren: child.children.length > 0, action: child.action })
      visit(child, depth + 1)
    }
  }
  visit(rootItem, 0)
  return out
}

async function registerServiceWorker(): Promise<void> {
  if (!navigator.serviceWorker)
    throw new Error('Service workers unavailable. Serve over https or localhost.')
  const registration = await navigator.serviceWorker.register('sw.bundle.js', { updateViaCache: 'none' })
  await registration.update()
  if (!navigator.serviceWorker.controller)
    await new Promise<void>((resolve) => { navigator.serviceWorker.oncontrollerchange = () => resolve() })
  setInterval(() => {
    void fetch('ping')
  }, 10_000)
}

async function load(uri: string, name = ''): Promise<void> {
  status.value = 'loading'
  errorKind.value = 'generic'
  traceUri.value = uri
  traceName.value = name
  try {
    await registerServiceWorker()
    const res = await fetch(`contexts?trace=${encodeURIComponent(uri)}`)
    if (!res.ok)
      throw new Error(await parseErrorResponse(res))
    const contexts = await res.json() as ContextEntry[]
    const m = new TraceModel(uri, contexts)
    model.value = m
    items.value = flatten(m)
    collapsed.value = new Set()
    timeRange.value = null
    sourceReveal.value = null
    pickedLocator.value = null
    inspectingLocator.value = false
    // Default selection: failed action, else the last page action with a
    // snapshot (most representative page state), else the first action.
    const failed = m.failedAction()
    const lastWithPage = [...items.value].reverse().find(i =>
      m.hasDomSnapshotForCall(i.action.callId, 'after')
      || m.hasDomSnapshotForCall(i.action.callId, 'action')
      || m.hasDomSnapshotForCall(i.action.callId, 'before'),
    )
    selectedId.value = (failed?.callId ?? lastWithPage?.id ?? items.value[0]?.id) ?? null
    status.value = 'ready'
  }
  catch (err: any) {
    errorMessage.value = err?.message ?? String(err)
    errorKind.value = isUnsupportedTraceVersion(errorMessage.value) ? 'unsupported-trace-version' : 'generic'
    status.value = 'error'
  }
}

async function parseErrorResponse(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const data = JSON.parse(text) as { error?: string, message?: string }
    return data.error ?? data.message ?? text
  }
  catch {
    return text
  }
}

function isUnsupportedTraceVersion(message: string): boolean {
  return message.includes('created by a newer version of Playwright') || message.includes('newer version of Playwright')
}

// Opening a trace from disk stays entirely client-side: the object URL is fetched
// by the service worker, which range-reads the zip exactly as for a remote trace.
// Nothing is uploaded.
let objectUrl: string | null = null

async function loadFile(file: File): Promise<void> {
  if (objectUrl)
    URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(file)
  await load(objectUrl, file.name)
}

// Hide descendants of collapsed nodes: skip rows deeper than the last collapsed one.
const visibleItems = computed<ActionItem[]>(() => {
  const out: ActionItem[] = []
  let hiddenDepth = Infinity
  for (const it of items.value) {
    if (it.depth > hiddenDepth)
      continue
    hiddenDepth = Infinity
    out.push(it)
    if (it.hasChildren && collapsed.value.has(it.id))
      hiddenDepth = it.depth
  }
  return out
})

function toggleCollapse(id: string): void {
  const next = new Set(collapsed.value)
  if (next.has(id))
    next.delete(id)
  else
    next.add(id)
  collapsed.value = next
}

function setHoveredAction(id: string | null): void {
  hoveredActionId.value = id
}

const selectedIndex = computed(() => items.value.findIndex(i => i.id === selectedId.value))
const selectedAction = computed<ActionEntry | undefined>(() => items.value[selectedIndex.value]?.action)
const snapshots = computed(() => collectSnapshots(model.value, selectedAction.value))
const currentSnapshot = computed<Snapshot | undefined>(() => snapshots.value[snapshotTab.value])
const currentSnapshotUrl = computed(() => snapshotUrl(traceUri.value, currentSnapshot.value))

const boundaries = computed(() => {
  const m = model.value
  return { min: m?.startTime ?? 0, max: m?.endTime ?? 1 }
})

function setTimeRange(a: number, b: number): void {
  const { start, end } = normalizeRange(a, b)
  timeRange.value = end > start ? { start, end } : null
}

function zoomToAction(action: ActionEntry): void {
  const start = action.startTime ?? 0
  const end = action.endTime ?? start
  setTimeRange(start, end)
}

function clearTimeRange(): void {
  timeRange.value = null
}

function select(id: string): void {
  selectedId.value = id
  sourceReveal.value = null
  pickedLocator.value = null
}

function selectIndex(index: number): void {
  const item = items.value[index]
  if (item)
    select(item.id)
}

function step(delta: number): void {
  selectIndex(selectedIndex.value + delta)
}

function setTab(tab: SnapshotTab): void {
  snapshotTab.value = tab
}

function setDetailTab(tab: DetailTab): void {
  detailTab.value = tab
}

function revealSource(stack: StackFrame[]): void {
  sourceReveal.value = { stack, version: ++sourceRevealVersion }
  detailTab.value = 'source'
}

function setInspectingLocator(value: boolean): void {
  inspectingLocator.value = value
}

function pickLocator(locator: PickedLocator): void {
  pickedLocator.value = locator
  inspectingLocator.value = false
  detailTab.value = 'locator'
}

function stopPlay(): void {
  playing.value = false
  if (playTimer) {
    clearInterval(playTimer)
    playTimer = undefined
  }
}

function startPlayTimer(): void {
  if (playTimer)
    clearInterval(playTimer)
  playTimer = setInterval(() => {
    if (selectedIndex.value >= items.value.length - 1) {
      stopPlay()
      return
    }
    step(1)
  }, 700 / playbackSpeed.value)
}

function cyclePlaybackSpeed(): void {
  playbackSpeedIndex.value = (playbackSpeedIndex.value + 1) % PLAYBACK_SPEEDS.length
  if (playing.value)
    startPlayTimer()
}

// Auto-advance selection through actions (slideshow). Stops at the last action.
function togglePlay(): void {
  if (playing.value) {
    stopPlay()
    return
  }
  if (selectedIndex.value >= items.value.length - 1)
    selectIndex(0)
  playing.value = true
  startPlayTimer()
}

async function refreshSnapshotInfo(): Promise<void> {
  const infoUrl = snapshotInfoUrl(traceUri.value, currentSnapshot.value)
  if (!infoUrl) {
    snapshotInfo.value = {}
    return
  }
  try {
    const res = await fetch(infoUrl)
    snapshotInfo.value = res.ok ? await res.json() : {}
  }
  catch {
    snapshotInfo.value = {}
  }
}

export function useTraceStore() {
  return {
    status,
    errorMessage,
    errorKind,
    traceUri,
    traceName,
    model,
    items,
    visibleItems,
    collapsed,
    toggleCollapse,
    hoveredActionId,
    setHoveredAction,
    selectedId,
    selectedIndex,
    selectedAction,
    snapshotTab,
    snapshots,
    currentSnapshot,
    currentSnapshotUrl,
    snapshotInfo,
    detailTab,
    sourceReveal,
    pickedLocator,
    inspectingLocator,
    playing,
    playbackSpeed,
    timeRange,
    boundaries,
    load,
    loadFile,
    select,
    selectIndex,
    step,
    setTab,
    setDetailTab,
    revealSource,
    setInspectingLocator,
    pickLocator,
    togglePlay,
    cyclePlaybackSpeed,
    setTimeRange,
    zoomToAction,
    clearTimeRange,
    refreshSnapshotInfo,
  }
}
