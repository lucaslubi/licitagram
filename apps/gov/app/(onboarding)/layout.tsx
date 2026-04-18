import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasCompletedOnboarding } from '@/lib/auth/profile'
import { Logo } from '@/components/app/Logo'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Already onboarded? Skip the wizard.
  if (await hasCompletedOnboarding()) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-6">
          <Logo />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10 sm:py-14">{children}</main>
    </div>
  )
}
