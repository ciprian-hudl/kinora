import type { ChartConfig } from '../chart'
import { h } from 'vue'
import StackedAreaChart from './StackedAreaChart.vue'

// A type alias, not an interface: the chart wants a Record<string, unknown>.
// eslint-disable-next-line ts/consistent-type-definitions
type Bucket = { day: string, expected: number, flaky: number, unexpected: number }

const DATA: Bucket[] = [
  { day: 'Oct 1', expected: 40, flaky: 2, unexpected: 1 },
  { day: 'Oct 2', expected: 38, flaky: 4, unexpected: 3 },
  { day: 'Oct 3', expected: 12, flaky: 1, unexpected: 6 },
  { day: 'Oct 4', expected: 44, flaky: 3, unexpected: 0 },
  { day: 'Oct 5', expected: 41, flaky: 6, unexpected: 2 },
  { day: 'Oct 6', expected: 45, flaky: 1, unexpected: 1 },
]

const CONFIG = {
  expected: { label: 'Passed', color: 'var(--pass)' },
  flaky: { label: 'Flaky', color: 'var(--flaky)' },
  unexpected: { label: 'Failed', color: 'var(--fail)' },
} satisfies ChartConfig

function story(normalize: boolean) {
  return () => h('div', { class: 'h-48 w-[28rem]' }, [
    h(StackedAreaChart<Bucket>, {
      data: DATA,
      x: (_d: Bucket, i: number) => i,
      series: ['expected', 'flaky', 'unexpected'],
      config: CONFIG,
      normalize,
      xTickFormat: (i: number) => DATA[i]?.day ?? '',
      class: 'h-full w-full',
    }),
  ])
}

export const Normalized = story(true)
export const Absolute = story(false)
