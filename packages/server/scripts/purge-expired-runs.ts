/* eslint-disable perfectionist/sort-imports -- ../src/instrument must load first so Sentry inits before other modules */
import '../src/instrument'
import * as Sentry from '@sentry/node'
import process from 'node:process'
import { purgeExpiredRuns } from '../src/billing/retention'
import { logger } from '../src/lib/logger'

purgeExpiredRuns(new Date())
  .then(async ({ deleted, artifacts, blobFailures }) => {
    logger.info({ deleted, artifacts, blobFailures }, 'purge-expired-runs complete')
    // One summary event rather than one per key: a storage outage can fail thousands at once.
    if (blobFailures > 0) {
      Sentry.captureMessage('purge-expired-runs left orphaned blobs in storage', { level: 'error', tags: { area: 'retention' }, extra: { blobFailures, deleted } })
      await Sentry.flush(2000)
    }
    process.exit(0)
  })
  .catch(async (error) => {
    logger.error({ error }, 'purge-expired-runs failed')
    Sentry.captureException(error, { tags: { area: 'retention' } })
    // Sentry sends in the background; exiting right away would drop the report.
    await Sentry.flush(2000)
    process.exit(1)
  })
