'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Sentry is wired via instrumentation.ts; it auto-captures errors in App Router.
    // eslint-disable-next-line no-console
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Algo deu errado</h1>
      <p className="text-muted-foreground">
        Registramos o erro e nossa equipe foi notificada. Tente novamente em instantes.
      </p>
      {error.digest && (
        <code className="rounded bg-secondary px-2 py-1 text-xs text-secondary-foreground">
          ref: {error.digest}
        </code>
      )}
      <button
        onClick={reset}
        className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Tentar novamente
      </button>
    </main>
  )
}
