import pino from 'pino'

/**
 * Structured logger. PII redaction applies to known sensitive fields (RI-14).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'cpf',
      'cnpj',
      'email',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.cpf',
      '*.email',
      '*.senha',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
  base: { app: 'licitagov' },
  timestamp: pino.stdTimeFunctions.isoTime,
})
