/* eslint-disable perfectionist/sort-imports -- ../src/instrument must load first so Sentry inits before other modules */
import '../src/instrument'
import * as Sentry from '@sentry/node'
import process from 'node:process'
import { reportPendingUsage } from '../src/billing/metering'
import { logger } from '../src/lib/logger'

reportPendingUsage(new Date())
  .then(async ({ reported, failed }) => {
    logger.info({ reported, failed }, 'report-pending-usage complete')
    // One summary event rather than one per run: a Polar outage can leave hundreds pending at once.
    if (failed > 0)
      Sentry.captureMessage('report-pending-usage left billable runs unreported', { level: 'error', tags: { area: 'billing' }, extra: { reported, failed } })
    // Sentry sends in the background; exiting right away would drop what the job just reported.
    await Sentry.flush(2000)
    // Non-zero when some runs are still pending, so the cron surfaces a persistent Polar failure.
    process.exit(failed > 0 ? 1 : 0)
  })
  .catch(async (error) => {
    logger.error({ error }, 'report-pending-usage failed')
    Sentry.captureException(error, { tags: { area: 'billing' } })
    await Sentry.flush(2000)
    process.exit(1)
  })
