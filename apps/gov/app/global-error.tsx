'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: '48px 20px',
          maxWidth: 640,
          margin: '0 auto',
          color: '#0f172a',
        }}
      >
        <h1 style={{ fontSize: 28, margin: 0 }}>Algo deu errado</h1>
        <p style={{ color: '#64748b', lineHeight: 1.6, marginTop: 8 }}>
          Um erro inesperado aconteceu. Nosso time foi notificado. Tente novamente em instantes.
        </p>
        {error.digest ? (
          <p style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', marginTop: 12 }}>
            Código do incidente: {error.digest}
          </p>
        ) : null}
        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: '#2563eb',
              color: 'white',
              border: 0,
              padding: '10px 18px',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
          <a
            href="/"
            style={{
              color: '#2563eb',
              padding: '10px 18px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Voltar pro início
          </a>
        </div>
      </body>
    </html>
  )
}
