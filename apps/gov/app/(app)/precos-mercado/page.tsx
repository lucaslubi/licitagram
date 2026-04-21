import type { Metadata } from 'next'
import { TrendingUp } from 'lucide-react'
import { PrecosMercadoClient } from './precos-mercado-client'

export const metadata: Metadata = { title: 'Preços de Mercado' }

/**
 * Janela padrão de pesquisa: últimos 6 meses.
 * Acórdão TCU 1.875/2021 recomenda analisar 12 meses, mas 6 meses dá
 * cobertura suficiente pra maioria dos itens no PNCP sem diluir tendência
 * em dados antigos. Usuário pode ampliar manualmente via filtros.
 */
function defaultDateRange(): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
  const from = sixMonthsAgo.toISOString().slice(0, 10)
  return { from, to }
}

export default function PrecosMercadoPage({
  searchParams,
}: {
  searchParams: { q?: string; modalidade?: string; uf?: string; from?: string; to?: string }
}) {
  const defaults = defaultDateRange()
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <TrendingUp className="h-4 w-4" /> Preços de Mercado
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Pesquisa de preços de mercado</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Consulta agregada sobre 254k licitações + 271k itens do PNCP. Use pra estudar mercado
          antes de abrir o processo, ou pra validar o preço estimado do ETP. Os dados são públicos
          (Lei da Transparência) e atualizados pelo scraper diariamente.{' '}
          <span className="text-foreground">Padrão: últimos 6 meses</span> — ajuste os filtros
          para ampliar ou restringir a janela.
        </p>
      </header>

      <PrecosMercadoClient
        initialQuery={searchParams.q ?? ''}
        initialModalidade={searchParams.modalidade ?? ''}
        initialUf={searchParams.uf ?? ''}
        initialDateFrom={searchParams.from ?? defaults.from}
        initialDateTo={searchParams.to ?? defaults.to}
      />
    </div>
  )
}
