import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app/AppSidebar'
import { AppHeader } from '@/components/app/AppHeader'
import { CommandPalette } from '@/components/app/CommandPalette'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware already redirects anon users, but defense in depth.
  if (!user) redirect('/login')

  const meta = (user.user_metadata ?? {}) as { nome_completo?: string; full_name?: string }
  const displayUser = {
    name: meta.nome_completo ?? meta.full_name ?? user.email ?? null,
    email: user.email ?? null,
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={displayUser} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <CommandPalette />
    </div>
  )
}
