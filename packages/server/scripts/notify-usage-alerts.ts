import process from 'node:process'
import { notifyUsageAlerts } from '../src/billing/usage-alerts'
import { logger } from '../src/lib/logger'

notifyUsageAlerts()
  .then(({ checked, sent }) => {
    logger.info({ checked, sent }, 'notify-usage-alerts complete')
    process.exit(0)
  })
  .catch((error) => {
    logger.error({ error }, 'notify-usage-alerts failed')
    process.exit(1)
  })
