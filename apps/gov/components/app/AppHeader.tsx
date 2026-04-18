'use client'

import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { MobileNav } from './MobileNav'

export function AppHeader({
  user,
}: {
  user?: { name?: string | null; email?: string | null }
}) {
  const triggerCommand = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <MobileNav />

      <Button
        variant="outline"
        onClick={triggerCommand}
        className="hidden h-9 w-full max-w-md justify-start gap-2 px-3 text-sm text-muted-foreground sm:flex"
      >
        <Search className="h-4 w-4" />
        Buscar ou navegar...
        <kbd className="ml-auto hidden font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:inline">
          ⌘K
        </kbd>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={triggerCommand}
        className="ml-auto sm:hidden"
        aria-label="Abrir command palette"
      >
        <Search className="h-4 w-4" />
      </Button>

      <div className="ml-auto hidden items-center gap-1 sm:flex">
        <ThemeToggle />
        <UserMenu name={user?.name ?? null} email={user?.email ?? null} />
      </div>
      <div className="flex items-center gap-1 sm:hidden">
        <UserMenu name={user?.name ?? null} email={user?.email ?? null} />
      </div>
    </header>
  )
}
