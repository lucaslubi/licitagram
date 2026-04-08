import 'dotenv/config'
import { db as supabase } from '../lib/db'
import { logger } from '../lib/logger'

async function checkTables() {
  const tables = ['tender_items', 'price_history'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      logger.error({ table, error }, `Table ${table} check failed`);
    } else {
      logger.info({ table }, `Table ${table} exists and is accessible`);
    }
  }
}

checkTables();
