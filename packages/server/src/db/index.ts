import { drizzle } from 'drizzle-orm/node-postgres'
import { env } from '../lib/env'
import { logger } from '../lib/logger'
import * as schema from './schemas/index'

export const db = drizzle({
  schema,
  connection: {
    user: env.POSTGRES_USER,
    host: env.POSTGRES_HOST,
    database: env.POSTGRES_DB,
    password: env.POSTGRES_PASSWORD,
    port: env.POSTGRES_PORT,
    // Bound the pool: cap connections, fail fast when the pool is exhausted instead of hanging,
    // and let Postgres abort a runaway query so it can't pin a connection forever.
    max: 10,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  },
})

// A Postgres restart drops idle pooled connections. Without a listener, node-postgres rethrows that as an
// uncaught exception and the process dies; the pool replaces the connection on the next query anyway.
// The error carries the whole pg client: log what identifies it, not that.
db.$client.on('error', (err: Error & { code?: string }) => {
  logger.warn({ code: err.code, error: err.message }, 'idle database connection lost')
})
