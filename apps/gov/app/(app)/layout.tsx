import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app/AppSidebar'
import { AppHeader } from '@/components/app/AppHeader'
import { CommandPalette } from '@/components/app/CommandPalette'
import { PostHogIdentify } from '@/components/app/PostHogIdentify'
import { getCurrentProfile } from '@/lib/auth/profile'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()

  // Middleware already gates this — defense in depth here.
  if (!profile) redirect('/login')
  if (!profile.orgao) redirect('/onboarding')

  const displayUser = {
    name: profile.nomeCompleto || profile.email,
    email: profile.email,
  }

  return (
    <div className="flex min-h-screen bg-background">
      <PostHogIdentify
        userId={profile.userId}
        email={profile.email}
        orgaoId={profile.orgao.id}
        orgaoEsfera={profile.orgao.esfera}
        orgaoUf={profile.orgao.uf}
        papel={profile.papel}
      />
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={displayUser} orgao={profile.orgao} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <CommandPalette />
    </div>
  )
}
