import { checkout, polar, portal, usage, webhooks } from '@polar-sh/better-auth'
import { createPolarCore } from '@polar-sh/sdk/2026-10'
import { listCustomerMeters } from '@polar-sh/sdk/2026-10/services/customer_meters'
import { ingestEvents } from '@polar-sh/sdk/2026-10/services/events'
import { getProducts } from '@polar-sh/sdk/2026-10/services/products'
import * as Sentry from '@sentry/node'
import { cloud, env } from '../lib/env'
import { logger } from '../lib/logger'
import { syncCustomerState } from './entitlements'

export const polarClient = cloud
  ? createPolarCore({
      accessToken: cloud.accessToken,
      environment: env.NODE_ENV === 'production' ? 'production' : 'sandbox',
    })
  : null

const TEST_RESULTS_EVENT = 'test_results'
const INGEST_MAX_RETRIES = 3

function retryAfterMs(error: unknown, attempt: number): number {
  const seconds = Number((error as { retryAfter?: number | null }).retryAfter)
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
      await ingestEvents(polarClient)({ events: [{ name: TEST_RESULTS_EVENT, external_id: eventId, external_customer_id: externalCustomerId, metadata: { results } }] })
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
  consumed_units: number
  credited_units: number
  meter: { filter: unknown }
}

// The customer meter fed by our usage events, identified by its event-name filter rather than a
// meter id so no extra env var has to stay in sync with the Polar dashboard.
export function pickResultsMeter(items: CustomerMeterLike[]): MeteredUsage | null {
  const item = items.find(i => JSON.stringify(i.meter.filter).includes(`"${TEST_RESULTS_EVENT}"`))
  return item ? { consumed: Math.round(item.consumed_units), credited: Math.round(item.credited_units) } : null
}

// Usage as Polar bills it: summed over the subscription's billing cycle, not the calendar month.
// null when unavailable (self-host, no meter yet, Polar down) so callers fall back to the local count.
export async function meteredResults(externalCustomerId: string): Promise<MeteredUsage | null> {
  if (!polarClient)
    return null
  try {
    const page = await listCustomerMeters(polarClient)({ external_customer_id: externalCustomerId, limit: 100 })
    return pickResultsMeter(page.items)
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

interface ProductPricing {
  // The recurring fixed price, in cents.
  fixedAmount: number | null
  overage: OveragePrice | null
}

const pricingCache = new Map<string, { at: number, pricing: ProductPricing }>()

// A product's prices. Cached: they only change when the plan is edited in Polar, and callers would
// otherwise pay a second Polar round-trip on every load.
async function productPricing(productId: string): Promise<ProductPricing | null> {
  if (!polarClient)
    return null
  const hit = pricingCache.get(productId)
  if (hit && Date.now() - hit.at < PRICE_TTL_MS)
    return hit.pricing
  try {
    const product = await getProducts(polarClient)(productId)
    const live = product.prices.filter(p => !p.is_archived)
    const metered = live.find(p => 'amount_type' in p && p.amount_type === 'metered_unit')
    const fixed = live.find(p => 'amount_type' in p && p.amount_type === 'fixed')
    const pricing: ProductPricing = {
      fixedAmount: fixed && 'price_amount' in fixed ? fixed.price_amount : null,
      overage: metered && 'unit_amount' in metered
        ? { unitAmount: Number(metered.unit_amount), capAmount: metered.cap_amount, currency: metered.price_currency }
        : null,
    }
    pricingCache.set(productId, { at: Date.now(), pricing })
    return pricing
  }
  catch (error) {
    logger.error({ error, productId }, 'polar product price read failed')
    Sentry.captureException(error, { tags: { area: 'billing' }, extra: { productId } })
    return null
  }
}

// The product's metered price: what a result past the included credits costs.
export async function overagePrice(productId: string): Promise<OveragePrice | null> {
  return (await productPricing(productId))?.overage ?? null
}

// The product's recurring price in cents, for revenue reporting.
export async function planPriceCents(productId: string): Promise<number | null> {
  return (await productPricing(productId))?.fixedAmount ?? null
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
            userId: data.external_id,
            polarCustomerId: data.id,
            eventAt: new Date(timestamp),
            subscriptions: data.active_subscriptions.map(s => ({
              productId: s.product_id,
              status: s.status,
              currentPeriodEnd: new Date(s.current_period_end),
              cancelAtPeriodEnd: s.cancel_at_period_end,
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
