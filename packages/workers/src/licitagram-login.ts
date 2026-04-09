// Ensure .env gets loaded properly in PM2 regardless of CWD.
import { resolve } from 'path'
import { config } from 'dotenv'
config({ path: resolve(__dirname, '../../.env') })
config({ path: resolve(__dirname, '../.env') })
import { logger } from './lib/logger'
import { LoginServer } from './bot/login-server'

async function main() {
  const port = parseInt(process.env.LOGIN_SERVER_PORT || '3999', 10)
  const server = new LoginServer()
  
  server.start(port)
}

main().catch(err => {
  logger.error({ err: err.message }, 'Fatal login server error')
  process.exit(1)
})
