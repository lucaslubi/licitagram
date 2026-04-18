import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getCurrentProfile } from '@/lib/auth/profile'
import { listSetoresAction } from '@/lib/setores/actions'
import { NovoProcessoForm } from './form'

export const metadata: Metadata = { title: 'Novo processo' }

export default async function NovoProcessoPage() {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) redirect('/onboarding')
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center text-muted-foreground">
        Apenas admin/coordenador pode criar processo.
      </div>
    )
  }
  const setores = (await listSetoresAction()).filter((s) => s.ativo)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/processos">
            <ArrowLeft className="h-4 w-4" /> Processos
          </Link>
        </Button>
      </div>
      <header className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">Novo processo</h1>
        <p className="text-sm text-muted-foreground">
          Descreva o objeto e o tipo. A IA redige DFD, ETP, Mapa de Riscos, TR, Edital e Parecer em sequência.
        </p>
      </header>
      <NovoProcessoForm setores={setores.map((s) => ({ id: s.id, nome: s.nome }))} />
    </div>
  )
}
