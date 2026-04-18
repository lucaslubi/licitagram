import type { Metadata } from 'next'
import { BookOpen, Globe, Package } from 'lucide-react'
import { getCurrentProfile } from '@/lib/auth/profile'
import { listCatalogo } from '@/lib/catalogo/actions'
import { CatalogoClient } from './catalogo-client'

export const metadata: Metadata = { title: 'Catálogo' }

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const profile = await getCurrentProfile()
  const canEdit = profile?.papel === 'admin' || profile?.papel === 'coordenador'
  const query = searchParams.q?.trim() || null
  const items = await listCatalogo(query, 200)

  const globalCount = items.filter((i) => i.scope === 'global').length
  const orgaoCount = items.length - globalCount

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Catálogo normalizado</p>
          <h1 className="text-3xl font-semibold tracking-tight">Itens do órgão</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Padronize nomes de itens usados nos processos. A IA consulta este catálogo ao gerar DFD/ETP/TR pra manter consistência entre licitações.
          </p>
        </div>
        <dl className="flex gap-4 text-sm">
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
        </dl>
      </header>

      <CatalogoClient items={items} canEdit={canEdit} initialQuery={query ?? ''} />

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card/40 p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">Catálogo vazio</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {canEdit
              ? 'Adicione itens recorrentes (papel A4, cadeira ergonômica, serviço de limpeza) pra que a IA os reutilize nos artefatos.'
              : 'Peça para um admin/coordenador cadastrar os itens recorrentes do órgão.'}
          </p>
        </div>
      )}
    </div>
  )
}
