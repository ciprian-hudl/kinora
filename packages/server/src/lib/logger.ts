import pino from 'pino'
import { env } from './env'
import { currentRequestId } from './request-context'

export const logger = pino({
  // JSON in production so log collectors keep every field; pretty output is for local dev only.
  transport: env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
  mixin() {
    const requestId = currentRequestId()
    return requestId ? { requestId } : {}
  },
})
