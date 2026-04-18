import type { Metadata } from 'next'
import { Users } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentProfile } from '@/lib/auth/profile'
import { listEquipe, listConvites } from '@/lib/equipe/actions'
import { EquipeManager } from './equipe-manager'

export const metadata: Metadata = { title: 'Equipe' }

export default async function EquipePage() {
  const profile = await getCurrentProfile()
  const canManage = profile?.papel === 'admin' || profile?.papel === 'coordenador'
  const [membros, convites] = await Promise.all([listEquipe(), canManage ? listConvites() : Promise.resolve([])])

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Configurações</p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Users className="h-7 w-7 text-primary" /> Equipe
        </h1>
        <p className="text-sm text-muted-foreground">
          Convide membros do órgão. Cada um com seu papel — define o que pode aprovar.
        </p>
      </header>

      {!canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Membros do órgão</CardTitle>
            <CardDescription>Apenas admin/coordenador pode convidar novos membros.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {membros.map((m) => (
                <li key={m.id} className="p-3 text-sm">
                  <p className="font-medium">{m.nomeCompleto}</p>
                  <p className="text-xs text-muted-foreground">{m.email} · {m.papel}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <EquipeManager membros={membros} convites={convites} currentUserId={profile!.userId} />
      )}
    </div>
  )
}
