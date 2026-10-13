<script setup lang="ts" generic="T extends Record<string, unknown>">
import type { HTMLAttributes } from 'vue'
import type { ChartConfig } from '../chart'
import { CurveType } from '@unovis/ts'
import { VisArea, VisAxis, VisXYContainer } from '@unovis/vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, ref } from 'vue'
import { ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent, componentToString } from '../chart'

// Several series stacked on one time axis, e.g. passed / flaky / failed per day. `series` lists
// config keys bottom to top; each is also the datum field holding that series' value.
// `normalize` stacks shares of the datum total (0 to 100%) instead of raw values, so the chart
// shows the mix whatever the volume; the tooltip still reads the raw values.
const props = defineProps<{
  data: T[]
  x: (d: T, i: number) => number
  series: string[]
  config: ChartConfig
  normalize?: boolean
  xTickFormat?: (x: number) => string
  // Tooltip title; defaults to xTickFormat (e.g. a week range where the axis shows its first day).
  xLabelFormat?: (x: number) => string
  // Whole period to show, so a range reads as such even when its first or last buckets are empty.
  xDomain?: [number, number]
  // Candidate ticks; default to the data points.
  xTicks?: number[]
  class?: HTMLAttributes['class']
}>()

const value = (d: T, key: string) => Number(d[key]) || 0

// Unovis draws an entering area at its final shape and only fades it in. Rendering it flat on
// the baseline first, then switching to the data, makes it tween up from there instead, like the
// line of AreaChart. The switch waits for that first render (Unovis renders on its own frame) and
// goes through the data: the Vue wrapper does not pick up new accessors that look the same.
// With reduced motion there is no growing and no Unovis transition at all.
const still = usePreferredReducedMotion().value === 'reduce'
const grown = ref(still)
function grow() {
  grown.value = true
}
const flat = computed(() => props.data.map(d => ({ ...d, ...Object.fromEntries(props.series.map(k => [k, 0])) }) as T))
const shown = computed(() => (grown.value ? props.data : flat.value))

const y = computed(() => props.series.map(key => (d: T) => {
  if (!props.normalize)
    return value(d, key)
  const total = props.series.reduce((sum, k) => sum + value(d, k), 0)
  return total ? value(d, key) / total : 0
}))

// Called with the series index, by the areas and by the crosshair circles alike.
const color = (_: unknown, i: number) => `var(--color-${props.series[i]})`
const percent = (v: number) => `${Math.round(v * 100)}%`
// Ticks sit on data points (tick-text-adaptive-sets keeps an evenly spaced subset that fits),
// not on round numbers of a timestamp scale, which would label arbitrary times between two buckets.
const ticks = computed(() => props.xTicks ?? props.data.map(props.x))

// Built once in setup (componentToString calls useId internally).
const label = props.xLabelFormat ?? props.xTickFormat
const tooltip = componentToString(props.config, ChartTooltipContent, {
  labelFormatter: label ? (d: number | Date) => label(Number(d)) : undefined,
})
</script>

<template>
  <ChartContainer :config="config" :class="props.class" cursor>
    <VisXYContainer :data="shown" :x-domain="xDomain" :y-domain="normalize ? [0, 1] : undefined" :duration="still ? 0 : undefined" :on-render-complete="grow">
      <VisArea :x="x" :y="y" :color="color" :curve-type="CurveType.MonotoneX" :opacity="0.85" />
      <VisAxis
        v-if="xTickFormat"
        type="x"
        :x="x"
        :tick-format="xTickFormat"
        :tick-values="ticks"
        tick-text-adaptive-sets
        :grid-line="false"
        :domain-line="false"
        :tick-line="false"
      />
      <VisAxis
        type="y"
        :tick-format="normalize ? percent : undefined"
        :num-ticks="normalize ? 2 : 3"
        :domain-line="false"
        :tick-line="false"
      />
      <ChartTooltip />
      <!-- camelCase on purpose: VisCrosshair forwards undeclared attrs as written, and Unovis reads `yStacked`. -->
      <!-- eslint-disable-next-line vue/attribute-hyphenation -->
      <ChartCrosshair :template="tooltip" :x="x" :yStacked="y" :color="color" />
    </VisXYContainer>
  </ChartContainer>
</template>
