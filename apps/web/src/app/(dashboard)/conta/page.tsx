import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { User, Lock, Bell, CreditCard, Monitor, Shield } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Conta · Licitagram' }

const SECTIONS = [
  { href: '/conta/perfil', icon: User, title: 'Perfil', description: 'Nome, email, telefone, fuso horário' },
  { href: '/conta/senha', icon: Lock, title: 'Senha e segurança', description: 'Alterar senha. Multi-fator em breve.' },
  { href: '/conta/notificacoes', icon: Bell, title: 'Notificações', description: 'Presets de qualidade, canais, palavras de exclusão' },
  { href: '/conta/assinatura', icon: CreditCard, title: 'Assinatura', description: 'Plano, faturas, cancelamento' },
  { href: '/conta/sessoes', icon: Monitor, title: 'Sessões', description: 'Dispositivos com login ativo' },
  { href: '/conta/privacidade', icon: Shield, title: 'Privacidade (LGPD)', description: 'Exportar dados, deletar conta' },
] as const

export default async function ContaOverviewPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, email, company_id')
    .eq('id', user.id)
    .single()

  const { data: company } = profile?.company_id
    ? await supabase.from('companies').select('razao_social').eq('id', profile.company_id).single()
    : { data: null }

  const { data: sub } = profile?.company_id
    ? await supabase
        .from('subscriptions')
        .select('status, plan_name, expires_at')
        .eq('company_id', profile.company_id)
        .maybeSingle()
    : { data: null }

  return (
    <div className="space-y-6">
      <div className="bg-secondary/30 border border-border rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-semibold">
            {(profile?.full_name?.[0] || user.email?.[0] || '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{profile?.full_name || user.email}</p>
            <p className="text-xs text-muted-foreground truncate">
              {company?.razao_social ?? '—'} {sub ? `· ${sub.plan_name ?? sub.status}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="block p-4 rounded-lg border border-border hover:border-foreground/20 hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              <s.icon size={18} className="mt-0.5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
