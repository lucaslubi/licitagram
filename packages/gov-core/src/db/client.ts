import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let client: ReturnType<typeof createClient> | null = null

function createClient() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set — cannot initialize gov-core DB client')
  }
  const queryClient = postgres(url, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
  })
  return drizzle(queryClient, { schema })
}

/**
 * Lazy-initialized Drizzle client for the `licitagov.*` schema.
 * Throws if DATABASE_URL is not set.
 */
export function getDb() {
  if (!client) client = createClient()
  return client
}

export { schema }
