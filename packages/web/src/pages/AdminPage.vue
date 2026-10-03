<script setup lang="ts">
import type { ChartConfig } from '@kinora/ui/chart'
import { AreaChart } from '@kinora/ui/area-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@kinora/ui/card'
import { Separator } from '@kinora/ui/separator'
import { Skeleton } from '@kinora/ui/skeleton'
import { StatBlock } from '@kinora/ui/stat-block'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@kinora/ui/table'
import { formatTimeAgo } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useAdminAccounts, useAdminOverview, useAdminTimeseries } from '@/composables/queries'
import { formatBytes, money } from '@/lib/format'

const { state: overview, isLoading: overviewLoading, error: overviewError } = useAdminOverview()
const { state: series, error: seriesError } = useAdminTimeseries()
const { state: accounts, isLoading: accountsLoading, error: accountsError } = useAdminAccounts()

const signups = computed(() => series.value.signups)
const runs = computed(() => series.value.runs)
const signupTotal = computed(() => signups.value.reduce((s, b) => s + b.count, 0))
const runTotal = computed(() => runs.value.reduce((s, b) => s + b.count, 0))

const signupsConfig = { count: { label: 'Signups', color: 'var(--chart-1)' } } satisfies ChartConfig
const runsConfig = { count: { label: 'Runs', color: 'var(--chart-2)' } } satisfies ChartConfig

function shortDate(iso: string | undefined): string {
  if (!iso)
    return ''
  // Date-only bucket ('YYYY-MM-DD'); append time so it parses as local midnight, not UTC.
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

type Account = (typeof accounts.value)[number]
type SortKey = 'name' | 'plan' | 'usagePct' | 'overageResults' | 'prevMonthResults' | 'runs30d' | 'storageBytes' | 'members' | 'projects' | 'lastRunAt'
const sortKey = ref<SortKey>('lastRunAt')
const sortDir = ref<'asc' | 'desc'>('desc')

function sortBy(key: SortKey): void {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortKey.value = key
    sortDir.value = key === 'name' || key === 'plan' ? 'asc' : 'desc'
  }
}

const sortedAccounts = computed(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...accounts.value].sort((a, b) => {
    const av = a[sortKey.value]
    const bv = b[sortKey.value]
    if (av === bv)
      return 0
    if (av === null)
      return 1
    if (bv === null)
      return -1
    return (av < bv ? -1 : 1) * dir
  })
})

const fmt = (n: number): string => n.toLocaleString()
const columns: { key: SortKey, label: string, numeric?: boolean }[] = [
  { key: 'name', label: 'Account' },
  { key: 'plan', label: 'Plan' },
  { key: 'usagePct', label: 'Results', numeric: true },
  { key: 'overageResults', label: 'Overage', numeric: true },
  { key: 'prevMonthResults', label: 'Prev. month', numeric: true },
  { key: 'runs30d', label: 'Runs (30d)', numeric: true },
  { key: 'storageBytes', label: 'Storage', numeric: true },
  { key: 'members', label: 'Members', numeric: true },
  { key: 'projects', label: 'Projects', numeric: true },
  { key: 'lastRunAt', label: 'Last run', numeric: true },
]

function lastRun(iso: string | null): string {
  return iso ? formatTimeAgo(new Date(iso)) : 'never'
}

// Plans are sold in a single currency.
const CURRENCY = 'usd'
const NEAR_PCT = 80

const paying = computed(() => accounts.value.filter(a => a.plan !== 'free'))
const payingByPlan = computed(() => ['team', 'pro', 'enterprise']
  .map(plan => ({ plan, n: paying.value.filter(a => a.plan === plan).length }))
  .filter(p => p.n > 0)
  .map(p => `${p.n} ${p.plan}`)
  .join(' · '))
const mrrCents = computed(() => paying.value.reduce((s, a) => s + (a.planPriceCents ?? 0), 0))
const overageCents = computed(() => accounts.value.reduce((s, a) => s + (a.overageCents ?? 0), 0))
const nearLimit = computed(() => accounts.value.filter(a => a.usagePct != null && a.usagePct >= NEAR_PCT).length)

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// What the collapsed `plan` hides: a lapsed paid plan, a scheduled cancellation, the renewal date.
function planNote(a: Account): { text: string, tone: string } | null {
  const sub = a.subscription
  if (a.unlimited)
    return { text: 'admin · no caps', tone: 'text-muted-foreground' }
  if (!sub)
    return null
  if (a.plan === 'free' && sub.tier !== 'free')
    return { text: `${sub.tier} · ${sub.status ?? 'inactive'}`, tone: 'text-fail' }
  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd)
    return { text: `cancels ${shortDay(sub.currentPeriodEnd)}`, tone: 'text-fail' }
  if (sub.status === 'trialing' && sub.currentPeriodEnd)
    return { text: `trial until ${shortDay(sub.currentPeriodEnd)}`, tone: 'text-signal' }
  if (a.plan !== 'free' && sub.currentPeriodEnd)
    return { text: `renews ${shortDay(sub.currentPeriodEnd)}`, tone: 'text-muted-foreground' }
  return null
}

function usageText(a: Account): string {
  return a.includedResults == null ? fmt(a.usedResults) : `${fmt(a.usedResults)} / ${fmt(a.includedResults)}`
}

function usagePeriodText(a: Account): string {
  const period = a.usagePeriod === 'cycle' ? 'billing period' : 'this month'
  return a.usagePct == null ? period : `${a.usagePct}% · ${period}`
}

// Past the included results a free plan is blocked (fail), a paid one bills overage (brand tone).
function usageTone(a: Account): string {
  if (a.usagePct == null || a.usagePct < NEAR_PCT)
    return ''
  if (a.usagePct < 100)
    return 'text-flaky'
  return a.plan === 'free' ? 'text-fail' : 'text-signal'
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">
        Platform admin
      </h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Adoption, usage and revenue across every account. Operator-only.
      </p>
    </div>

    <div
      v-if="overviewError"
      class="rounded-lg border border-fail/30 bg-fail/5 px-5 py-4 font-mono text-sm text-fail"
    >
      Failed to load admin stats: {{ String(overviewError) }}
    </div>

    <!-- KPI row -->
    <Skeleton v-else-if="overviewLoading || !overview" class="h-24 rounded-lg" />
    <div
      v-else
      class="flex flex-wrap items-start gap-x-10 gap-y-4 rounded-lg border border-border/70 bg-card/80 px-6 py-5"
    >
      <StatBlock label="Users" :value="fmt(overview.users)" :sub="`+${overview.newUsers7d} this week`" />
      <Separator orientation="vertical" class="h-10" />
      <StatBlock label="Accounts" :value="fmt(overview.accounts)" />
      <Separator orientation="vertical" class="h-10" />
      <StatBlock label="Active (30d)" :value="fmt(overview.activeAccounts)" tone="pass" />
      <Separator orientation="vertical" class="h-10" />
      <StatBlock label="Projects" :value="fmt(overview.projects)" />
      <Separator orientation="vertical" class="h-10" />
      <StatBlock label="Test results (30d)" :value="fmt(overview.testResults30d)" />
    </div>

    <!-- Revenue row: derived from the accounts below, so both always agree. -->
    <div
      v-if="!accountsError && !accountsLoading"
      class="flex flex-wrap items-start gap-x-10 gap-y-4 rounded-lg border border-border/70 bg-card/80 px-6 py-5"
    >
      <StatBlock label="Paying accounts" :value="fmt(paying.length)" :sub="payingByPlan || 'none yet'" />
      <Separator orientation="vertical" class="h-10" />
      <StatBlock label="MRR" :value="money(mrrCents, CURRENCY)" sub="plan prices, before overage" />
      <Separator orientation="vertical" class="h-10" />
      <StatBlock label="Overage so far" :value="money(overageCents, CURRENCY)" sub="current billing periods" />
      <Separator orientation="vertical" class="h-10" />
      <StatBlock :label="`At ${NEAR_PCT}%+ of included`" :value="fmt(nearLimit)" :tone="nearLimit ? 'flaky' : 'default'" />
    </div>

    <!-- Charts -->
    <div
      v-if="seriesError"
      class="rounded-lg border border-fail/30 bg-fail/5 px-5 py-4 font-mono text-sm text-fail"
    >
      Failed to load charts: {{ String(seriesError) }}
    </div>
    <div v-else class="grid gap-5 md:grid-cols-2">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground">
            Signups / week (12w)
          </CardTitle>
          <span class="font-mono text-2xl font-semibold tabular-nums">{{ fmt(signupTotal) }}</span>
        </CardHeader>
        <CardContent>
          <AreaChart
            v-if="signups.length"
            :data="signups"
            :x="(_, i) => i"
            :y="d => d.count"
            :config="signupsConfig"
            series-key="count"
            :x-tick-format="i => shortDate(signups[i]?.date)"
            class="h-32"
          />
          <p v-else class="py-4 font-mono text-xs text-muted-foreground">
            No data yet.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground">
            Runs / day (30d)
          </CardTitle>
          <span class="font-mono text-2xl font-semibold tabular-nums">{{ fmt(runTotal) }}</span>
        </CardHeader>
        <CardContent>
          <AreaChart
            v-if="runs.length"
            :data="runs"
            :x="(_, i) => i"
            :y="d => d.count"
            :config="runsConfig"
            series-key="count"
            :x-tick-format="i => shortDate(runs[i]?.date)"
            class="h-32"
          />
          <p v-else class="py-4 font-mono text-xs text-muted-foreground">
            No data yet.
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Accounts table -->
    <div class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold tracking-tight">
        Accounts
      </h2>
      <div
        v-if="accountsError"
        class="rounded-lg border border-fail/30 bg-fail/5 px-5 py-4 font-mono text-sm text-fail"
      >
        Failed to load accounts: {{ String(accountsError) }}
      </div>
      <Skeleton v-else-if="accountsLoading" class="h-64 rounded-lg" />
      <Table v-else>
        <TableHeader>
          <TableRow>
            <TableHead
              v-for="col in columns"
              :key="col.key"
              class="cursor-pointer select-none" :class="[col.numeric ? 'text-right' : '']"
              @click="sortBy(col.key)"
            >
              {{ col.label }}
              <span v-if="sortKey === col.key" class="text-muted-foreground">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableEmpty v-if="!sortedAccounts.length" :colspan="columns.length">
            No accounts yet.
          </TableEmpty>
          <TableRow v-for="a in sortedAccounts" :key="a.orgId">
            <TableCell>
              <div class="font-medium">
                {{ a.name }}
              </div>
              <div class="text-xs text-muted-foreground">
                {{ a.ownerEmail ?? '-' }}
              </div>
            </TableCell>
            <TableCell>
              <div class="font-mono text-xs uppercase" :class="a.plan === 'free' ? 'text-muted-foreground' : 'text-signal'">
                {{ a.plan }}
              </div>
              <div v-if="planNote(a)" class="text-xs" :class="planNote(a)!.tone">
                {{ planNote(a)!.text }}
              </div>
            </TableCell>
            <TableCell class="text-right tabular-nums">
              <div :class="usageTone(a)">
                {{ usageText(a) }}
              </div>
              <div class="text-xs text-muted-foreground">
                {{ usagePeriodText(a) }}
              </div>
            </TableCell>
            <TableCell class="text-right tabular-nums" :class="a.overageResults ? 'text-signal' : 'text-muted-foreground'">
              <template v-if="a.overageResults">
                <div>+{{ fmt(a.overageResults) }}</div>
                <div v-if="a.overageCents != null" class="text-xs">
                  {{ money(a.overageCents, CURRENCY) }}
                </div>
              </template>
              <template v-else>
                -
              </template>
            </TableCell>
            <TableCell class="text-right tabular-nums" :class="a.prevMonthResults ? '' : 'text-muted-foreground'">
              {{ fmt(a.prevMonthResults) }}
            </TableCell>
            <TableCell class="text-right tabular-nums" :class="a.runs30d ? '' : 'text-muted-foreground'">
              {{ fmt(a.runs30d) }}
            </TableCell>
            <TableCell class="text-right tabular-nums">
              <div>{{ formatBytes(a.storageBytes) }}</div>
              <div v-if="a.storageLimitBytes != null" class="text-xs text-muted-foreground">
                of {{ formatBytes(a.storageLimitBytes) }}
              </div>
            </TableCell>
            <TableCell class="text-right tabular-nums">
              {{ a.members }}
            </TableCell>
            <TableCell class="text-right tabular-nums">
              {{ a.projects }}
            </TableCell>
            <TableCell class="text-right tabular-nums" :class="a.lastRunAt ? '' : 'text-muted-foreground'">
              {{ lastRun(a.lastRunAt) }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
