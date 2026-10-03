/* eslint-disable perfectionist/sort-imports -- ../src/instrument must load first so Sentry inits before other modules */
import '../src/instrument'
import * as Sentry from '@sentry/node'
import process from 'node:process'
import { notifyUsageAlerts } from '../src/billing/usage-alerts'
import { logger } from '../src/lib/logger'

notifyUsageAlerts()
  .then(async ({ checked, sent, undelivered }) => {
    logger.info({ checked, sent, undelivered }, 'notify-usage-alerts complete')
    // A mail outage is otherwise silent: the customer just never hears about their usage.
    if (undelivered > 0)
      Sentry.captureMessage('notify-usage-alerts could not deliver usage emails', { level: 'error', tags: { area: 'billing' }, extra: { checked, sent, undelivered } })
    // Sentry sends in the background; exiting right away would drop what the job just reported.
    await Sentry.flush(2000)
    process.exit(0)
  })
  .catch(async (error) => {
    logger.error({ error }, 'notify-usage-alerts failed')
    Sentry.captureException(error, { tags: { area: 'billing' } })
    await Sentry.flush(2000)
    process.exit(1)
  })
