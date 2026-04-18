import type { Metadata } from 'next'
import { Users } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/EmptyState'
import { getCurrentProfile } from '@/lib/auth/profile'
import { listSetoresAction } from '@/lib/setores/actions'
import { SetoresList } from './setores-list'

export const metadata: Metadata = { title: 'Setores' }

export default async function SetoresPage() {
  const profile = await getCurrentProfile()
  const setores = await listSetoresAction()
  const isAdmin = profile?.papel === 'admin' || profile?.papel === 'coordenador'

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Configurações</p>
        <h1 className="text-3xl font-semibold tracking-tight">Setores</h1>
        <p className="text-sm text-muted-foreground">
          Unidades requisitantes do órgão. Cada setor pode responder campanhas PCA, pedir processos e receber publicações.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle>Setores cadastrados</CardTitle>
            <CardDescription>
              {setores.length === 0
                ? 'Nenhum setor ainda.'
                : `${setores.filter((s) => s.ativo).length} ativos / ${setores.length} total`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {setores.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Comece cadastrando setores"
              description="Setores como Compras, TI, RH, Saúde. Ao criar uma campanha PCA, você convida cada setor individualmente."
            />
          ) : null}
          <SetoresList setores={setores} canEdit={!!isAdmin} />
        </CardContent>
      </Card>
    </div>
  )
}
