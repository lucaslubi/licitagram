import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PerfilForm } from './perfil-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Perfil · Licitagram' }

type ProfileRow = {
  full_name: string | null
  email: string | null
  company_id: string | null
  phone?: string | null
  timezone?: string | null
  language?: string | null
  avatar_url?: string | null
}

export default async function PerfilPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Try the full column set first; gracefully fall back when the Wave 2
  // migration hasn't been applied yet.
  let profile: ProfileRow | null = null
  let migrationApplied = true

  const full = await supabase
    .from('users')
    .select('full_name, email, company_id, phone, timezone, language, avatar_url')
    .eq('id', user.id)
    .single()

  if (full.error) {
    migrationApplied = false
    const fallback = await supabase
      .from('users')
      .select('full_name, email, company_id')
      .eq('id', user.id)
      .single()
    profile = fallback.data as ProfileRow | null
  } else {
    profile = full.data as ProfileRow | null
  }

  let companyName: string | null = null
  if (profile?.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('razao_social, nome_fantasia')
      .eq('id', profile.company_id)
      .single()
    companyName = company?.nome_fantasia || company?.razao_social || null
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Perfil</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Edite informações pessoais. Sua empresa é gerenciada em{' '}
          <a href="/company" className="underline hover:text-foreground">
            /company
          </a>
          .
        </p>
      </div>

      {!migrationApplied ? (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-200">
          Algumas colunas do perfil ainda não foram provisionadas no banco. Edição completa
          (telefone, fuso, idioma, avatar) volta após o deploy da migration Wave 2.
        </div>
      ) : null}

      <PerfilForm
        initial={{
          full_name: profile?.full_name ?? '',
          email: profile?.email ?? user.email ?? '',
          phone: profile?.phone ?? '',
          timezone: profile?.timezone ?? null,
          language: profile?.language ?? 'pt-BR',
          avatar_url: profile?.avatar_url ?? null,
          company_name: companyName,
        }}
        migrationApplied={migrationApplied}
      />
    </div>
  )
}
