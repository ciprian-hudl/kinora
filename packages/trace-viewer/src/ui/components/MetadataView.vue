<script setup lang="ts">
import { computed } from 'vue'
import { formatMs } from '../lib/format'
import { useTraceStore } from '../store'

const store = useTraceStore()

interface Row {
  key: string
  value: string
  href?: string
}

interface Section {
  title: string
  rows: Row[]
}

function row(key: string, value: unknown, href?: string): Row | undefined {
  if (value === undefined || value === null || value === '')
    return undefined
  return { key, value: String(value), href }
}

function rows(...items: (Row | undefined)[]): Row[] {
  return items.filter((item): item is Row => !!item)
}

function isHttpUrl(value: string | undefined): boolean {
  return !!value && /^https?:\/\//i.test(value)
}

const sections = computed<Section[]>(() => {
  const model = store.model.value
  if (!model)
    return []

  const wallTime = model.wallTime !== undefined
    ? new Date(model.wallTime).toLocaleString(undefined, { timeZoneName: 'short' })
    : undefined
  const baseURL = model.options.baseURL

  return [
    {
      title: 'Time',
      rows: rows(
        row('start time', wallTime),
        row('duration', formatMs(model.endTime - model.startTime)),
        row('test timeout', model.testTimeout !== undefined ? formatMs(model.testTimeout) : undefined),
      ),
    },
    {
      title: 'Browser',
      rows: rows(
        row('engine', model.browserName),
        row('channel', model.channel),
        row('platform', model.platform),
        row('playwright version', model.playwrightVersion),
        row('user agent', model.options.userAgent),
      ),
    },
    {
      title: 'Config',
      rows: rows(
        row('baseURL', baseURL, isHttpUrl(baseURL) ? baseURL : undefined),
      ),
    },
    {
      title: 'Viewport',
      rows: rows(
        row('width', model.options.viewport?.width),
        row('height', model.options.viewport?.height),
        row('is mobile', Boolean(model.options.isMobile)),
        row('device scale', model.options.deviceScaleFactor),
      ),
    },
    {
      title: 'Counts',
      rows: rows(
        row('pages', model.pages.length),
        row('actions', model.actions.length),
        row('events', model.events.length),
        row('network resources', model.resources.length),
        row('attachments', model.visibleAttachments.length),
      ),
    },
  ].filter(section => section.rows.length > 0)
})
</script>

<template>
  <div class="h-full overflow-auto p-3">
    <div v-if="!sections.length" class="flex h-full items-center justify-center text-sm text-muted-foreground">
      No metadata
    </div>
    <div v-else class="flex max-w-3xl flex-col gap-4">
      <section v-for="section in sections" :key="section.title">
        <h3 class="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {{ section.title }}
        </h3>
        <table class="w-full text-xs">
          <tbody>
            <tr v-for="item in section.rows" :key="item.key" class="border-b border-border/40 last:border-0">
              <td class="w-40 py-1.5 pr-4 align-top font-mono text-muted-foreground">
                {{ item.key }}
              </td>
              <td class="py-1.5 align-top font-mono break-all text-foreground/90">
                <a
                  v-if="item.href"
                  :href="item.href"
                  target="_blank"
                  rel="noreferrer"
                  class="underline underline-offset-2 hover:text-signal"
                >{{ item.value }}</a>
                <span v-else>{{ item.value }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>
