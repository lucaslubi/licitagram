import pino from 'pino'

export const logger = pino({
  name: 'licitagram',
  level: process.env.LOG_LEVEL || 'info',
})
