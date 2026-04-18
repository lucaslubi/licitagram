import { AppSidebar } from '@/components/app/AppSidebar'
import { AppHeader } from '@/components/app/AppHeader'
import { CommandPalette } from '@/components/app/CommandPalette'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Phase 2 will replace this stub with the real authenticated user from Supabase.
  const user = { name: 'Servidor demo', email: 'demo@licitagram.com' }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <CommandPalette />
    </div>
  )
}
