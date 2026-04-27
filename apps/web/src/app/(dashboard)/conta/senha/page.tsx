import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SenhaForm } from './senha-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Senha · Licitagram' }

export default async function SenhaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Senha</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Use uma senha forte e única. Após alterar, sessões em outros dispositivos podem
          expirar.
        </p>
      </div>
      <SenhaForm />
    </div>
  )
}
