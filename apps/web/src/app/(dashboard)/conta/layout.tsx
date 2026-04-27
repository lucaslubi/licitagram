import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const NAV = [
  { href: '/conta', label: 'Visão geral' },
  { href: '/conta/perfil', label: 'Perfil' },
  { href: '/conta/senha', label: 'Senha' },
  { href: '/conta/notificacoes', label: 'Notificações' },
  { href: '/conta/assinatura', label: 'Assinatura' },
  { href: '/conta/sessoes', label: 'Sessões' },
  { href: '/conta/privacidade', label: 'Privacidade' },
] as const

export default async function ContaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-5xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Conta</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie seu perfil, segurança, assinatura e privacidade.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8">
        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded-md text-sm hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
