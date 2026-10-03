import process from 'node:process'
import { reportPendingUsage } from '../src/billing/metering'
import { logger } from '../src/lib/logger'

reportPendingUsage(new Date())
  .then(({ reported, failed }) => {
    logger.info({ reported, failed }, 'report-pending-usage complete')
    // Non-zero when some runs are still pending, so the cron surfaces a persistent Polar failure.
    process.exit(failed > 0 ? 1 : 0)
  })
  .catch((error) => {
    logger.error({ error }, 'report-pending-usage failed')
    process.exit(1)
  })
