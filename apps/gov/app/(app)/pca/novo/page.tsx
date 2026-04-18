import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'
import { Users } from 'lucide-react'
import { getCurrentProfile } from '@/lib/auth/profile'
import { listSetoresAction } from '@/lib/setores/actions'
import { NewCampanhaWizard } from './wizard'

export const metadata: Metadata = { title: 'Nova campanha PCA' }

export default async function NewCampanhaPage() {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) redirect('/onboarding')
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center text-muted-foreground">
        Apenas admin/coordenador pode criar campanhas.
      </div>
    )
  }

  const setores = (await listSetoresAction()).filter((s) => s.ativo)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/pca">
            <ArrowLeft className="h-4 w-4" /> PCA
          </Link>
        </Button>
      </div>
      <header className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">Nova campanha</h1>
        <p className="text-sm text-muted-foreground">
          Em 4 passos você envia os convites e acompanha o progresso ao vivo.
        </p>
      </header>

      {setores.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Cadastre setores antes"
          description="Cada setor que participa da coleta precisa existir aqui. Leva 30s — volte depois."
          action={{ label: 'Ir para Setores', href: '/configuracoes/setores' }}
        />
      ) : (
        <NewCampanhaWizard setores={setores.map((s) => ({ id: s.id, nome: s.nome, sigla: s.sigla, hasResponsavel: !!s.responsavelId }))} />
      )}
    </div>
  )
}
