'use client'

import { Card, CardContent } from '@/components/ui/card'

export default function DocumentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="p-6">
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <h2 className="text-lg font-semibold text-red-400">Erro ao carregar documentos</h2>
          <p className="text-sm text-gray-400">
            {error.message || 'Ocorreu um erro inesperado. Tente novamente.'}
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-brand text-white rounded-md text-sm hover:opacity-90"
          >
            Tentar novamente
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
