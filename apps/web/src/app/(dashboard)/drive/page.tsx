import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DriveManager } from './drive-manager'

export default async function DrivePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Drive Licitagram</h1>
        <div className="rounded-2xl border border-black/[0.08] bg-white p-8 text-center">
          <p className="text-[#69695D]">Configure sua empresa primeiro para usar o Drive.</p>
          <a href="/company" className="text-[#F43E01] underline mt-2 inline-block">
            Configurar Empresa
          </a>
        </div>
      </div>
    )
  }

  const { data: company } = await supabase
    .from('companies')
    .select('razao_social')
    .eq('id', profile.company_id)
    .single()

  return (
    <DriveManager
      companyId={profile.company_id}
      companyName={company?.razao_social || 'Minha Empresa'}
    />
  )
}
