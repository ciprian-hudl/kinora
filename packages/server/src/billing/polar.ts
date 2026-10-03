import { checkout, polar, portal, usage, webhooks } from '@polar-sh/better-auth'
import { Polar } from '@polar-sh/sdk'
import * as Sentry from '@sentry/node'
import { cloud, env } from '../lib/env'
import { logger } from '../lib/logger'
import { syncCustomerState } from './entitlements'

export const polarClient = cloud
  ? new Polar({
      accessToken: cloud.accessToken,
      server: env.NODE_ENV === 'production' ? 'production' : 'sandbox',
    })
  : null

const TEST_RESULTS_EVENT = 'test_results'
const INGEST_MAX_RETRIES = 3

function retryAfterMs(error: unknown, attempt: number): number {
  const headers = (error as { headers?: unknown }).headers
  const raw = headers instanceof Headers ? headers.get('retry-after') : (headers as Record<string, string> | undefined)?.['retry-after']
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 4000) : 2 ** attempt * 500
}

// Bulk imports of current-period runs can burst past Polar's rate limit; retry 429s
// (honoring Retry-After) so billable usage isn't silently dropped. Best-effort: gives up
// after a few tries rather than stalling ingest. Normal per-run traffic never retries.
// `eventId` (the run id) is Polar's dedup key: resending the same run never bills it twice.
export async function meterTestResults(externalCustomerId: string, results: number, eventId: string): Promise<void> {
  if (!polarClient)
    return
  for (let attempt = 0; ; attempt++) {
    try {
      await polarClient.events.ingest({ events: [{ name: TEST_RESULTS_EVENT, externalId: eventId, externalCustomerId, metadata: { results } }] })
      return
    }
    catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 429 || attempt >= INGEST_MAX_RETRIES)
        throw error
      await new Promise(resolve => setTimeout(resolve, retryAfterMs(error, attempt)))
    }
  }
}

export interface MeteredUsage {
  consumed: number
  credited: number
}

interface CustomerMeterLike {
  consumedUnits: number
  creditedUnits: number
  meter: { filter: unknown }
}

// The customer meter fed by our usage events, identified by its event-name filter rather than a
// meter id so no extra env var has to stay in sync with the Polar dashboard.
export function pickResultsMeter(items: CustomerMeterLike[]): MeteredUsage | null {
  const item = items.find(i => JSON.stringify(i.meter.filter).includes(`"${TEST_RESULTS_EVENT}"`))
  return item ? { consumed: Math.round(item.consumedUnits), credited: Math.round(item.creditedUnits) } : null
}

// Usage as Polar bills it: summed over the subscription's billing cycle, not the calendar month.
// null when unavailable (self-host, no meter yet, Polar down) so callers fall back to the local count.
export async function meteredResults(externalCustomerId: string): Promise<MeteredUsage | null> {
  if (!polarClient)
    return null
  try {
    const page = await polarClient.customerMeters.list({ externalCustomerId, limit: 100 })
    return pickResultsMeter(page.result.items)
  }
  catch (error) {
    logger.error({ error, externalCustomerId }, 'polar customer meter read failed')
    // Swallowed so the page still renders: report it, or a broken billing read goes unnoticed.
    Sentry.captureException(error, { tags: { area: 'billing' }, extra: { externalCustomerId } })
    return null
  }
}

export interface OveragePrice {
  // Cents per unit; Polar allows fractions of a cent (0.4 = $0.004).
  unitAmount: number
  capAmount: number | null
  currency: string
}

// What the units past the included credits cost so far, in cents, honoring the price's cap.
export function overageCents(usage: MeteredUsage, price: OveragePrice): number {
  const amount = Math.max(0, usage.consumed - usage.credited) * price.unitAmount
  return price.capAmount == null ? amount : Math.min(amount, price.capAmount)
}

const PRICE_TTL_MS = 60 * 60 * 1000
const priceCache = new Map<string, { at: number, price: OveragePrice | null }>()

// The product's metered price. Cached: it only changes when the plan is edited in Polar, and the
// billing summary would otherwise pay a second Polar round-trip on every load.
export async function overagePrice(productId: string): Promise<OveragePrice | null> {
  if (!polarClient)
    return null
  const hit = priceCache.get(productId)
  if (hit && Date.now() - hit.at < PRICE_TTL_MS)
    return hit.price
  try {
    const product = await polarClient.products.get({ id: productId })
    const metered = product.prices.find(p => 'amountType' in p && p.amountType === 'metered_unit' && !p.isArchived)
    const price = metered && 'unitAmount' in metered
      ? { unitAmount: Number(metered.unitAmount), capAmount: metered.capAmount, currency: metered.priceCurrency }
      : null
    priceCache.set(productId, { at: Date.now(), price })
    return price
  }
  catch (error) {
    logger.error({ error, productId }, 'polar product price read failed')
    Sentry.captureException(error, { tags: { area: 'billing' }, extra: { productId } })
    return null
  }
}

export function polarAuthPlugin() {
  if (!cloud || !polarClient)
    return null

  return polar({
    client: polarClient,
    // We create the customer ourselves in the signup hook (non-fatal) so a Polar
    // hiccup never blocks sign-up; the plugin's own create is fatal on failure.
    createCustomerOnSignUp: false,
    use: [
      checkout({
        products: [
          { productId: cloud.teamProductId, slug: 'team' },
          { productId: cloud.proProductId, slug: 'pro' },
        ],
        successUrl: `${env.WEB_ORIGIN}/settings/workspace?checkout=success`,
        authenticatedUsersOnly: true,
      }),
      portal(),
      usage(),
      webhooks({
        secret: cloud.webhookSecret,
        onCustomerStateChanged: async ({ data, timestamp }) => {
          await syncCustomerState({
            userId: data.externalId,
            polarCustomerId: data.id,
            eventAt: timestamp,
            subscriptions: data.activeSubscriptions.map(s => ({
              productId: s.productId,
              status: s.status,
              currentPeriodEnd: s.currentPeriodEnd,
              cancelAtPeriodEnd: s.cancelAtPeriodEnd,
            })),
          })
        },
        onPayload: async (payload) => {
          logger.info({ event: payload.type }, 'polar webhook')
        },
      }),
    ],
  })
}
