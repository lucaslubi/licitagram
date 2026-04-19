import type { Metadata } from 'next'
import { BadgeCheck, Globe, Package, TrendingUp } from 'lucide-react'
import { getCurrentProfile } from '@/lib/auth/profile'
import { listCatalogo } from '@/lib/catalogo/actions'
import { searchCatalogoPncp } from '@/lib/precos/pncp-engine'
import { searchCatmatCatser } from '@/lib/precos/painel-oficial'
import { CatalogoClient } from './catalogo-client'

export const metadata: Metadata = { title: 'Catálogo' }

type Source = 'orgao' | 'pncp' | 'catmat'

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: { q?: string; source?: string }
}) {
  const profile = await getCurrentProfile()
  const canEdit = profile?.papel === 'admin' || profile?.papel === 'coordenador'
  const query = searchParams.q?.trim() || null
  const source: Source =
    searchParams.source === 'pncp' ? 'pncp' : searchParams.source === 'catmat' ? 'catmat' : 'orgao'

  // Sempre busca os do órgão (pra mostrar contadores no header).
  const itemsOrgao = await listCatalogo(query, 200)
  const orgaoCount = itemsOrgao.filter((i) => i.scope === 'orgao').length
  const globalCount = itemsOrgao.length - orgaoCount

  const itemsPncp = source === 'pncp' ? await searchCatalogoPncp(query, 200) : []
  const itemsCatmat = source === 'catmat' && query ? await searchCatmatCatser(query, undefined, 100) : []

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Catálogo normalizado</p>
          <h1 className="text-3xl font-semibold tracking-tight">Itens do órgão</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Padronize nomes dos itens recorrentes. A IA consulta este catálogo ao gerar DFD/ETP/TR.
            A aba <strong>PNCP</strong> expõe itens já contratados em licitações públicas reais
            (dados do Portal Nacional), com mediana histórica.
          </p>
        </div>
        <dl className="flex gap-3 text-sm">
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
            <dt className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Package className="h-3 w-3" /> Do órgão
            </dt>
            <dd className="mt-1 font-mono text-xl font-semibold text-primary">{orgaoCount}</dd>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-center">
            <dt className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Globe className="h-3 w-3" /> Globais
            </dt>
            <dd className="mt-1 font-mono text-xl font-semibold text-muted-foreground">{globalCount}</dd>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-center">
            <dt className="flex items-center justify-center gap-1 text-xs text-primary">
              <TrendingUp className="h-3 w-3" /> PNCP
            </dt>
            <dd className="mt-1 font-mono text-xl font-semibold text-primary">124k+</dd>
          </div>
          <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-center">
            <dt className="flex items-center justify-center gap-1 text-xs text-accent">
              <BadgeCheck className="h-3 w-3" /> CATMAT Oficial
            </dt>
            <dd className="mt-1 font-mono text-xl font-semibold text-accent">344k</dd>
          </div>
        </dl>
      </header>

      <CatalogoClient
        items={itemsOrgao}
        itemsPncp={itemsPncp}
        itemsCatmat={itemsCatmat}
        canEdit={canEdit}
        initialQuery={query ?? ''}
        source={source}
      />
    </div>
  )
}
