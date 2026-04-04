'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8">
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 max-w-lg w-full">
        <h2 className="text-lg font-bold text-red-400 mb-2">Erro na aplicacao</h2>
        <p className="text-sm text-gray-300 mb-1 font-mono break-all">
          {error.message || 'Erro desconhecido'}
        </p>
        {error.digest && (
          <p className="text-xs text-gray-500 mt-1">Digest: {error.digest}</p>
        )}
        <pre className="text-xs text-gray-500 mt-3 max-h-40 overflow-auto whitespace-pre-wrap">
          {error.stack?.slice(0, 500)}
        </pre>
      </div>
      <button
        onClick={reset}
        className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-medium"
      >
        Tentar novamente
      </button>
    </div>
  )
}
