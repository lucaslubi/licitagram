'use client'

import { Building2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { MobileNav } from './MobileNav'

interface OrgaoHeaderInfo {
  razaoSocial: string
  nomeFantasia: string | null
  esfera: string
  uf: string | null
}

export function AppHeader({
  user,
  orgao,
}: {
  user?: { name?: string | null; email?: string | null }
  orgao?: OrgaoHeaderInfo | null
}) {
  const triggerCommand = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
  }

  const orgaoLabel = orgao
    ? (orgao.nomeFantasia || orgao.razaoSocial)
    : null

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <MobileNav />

      {orgaoLabel && (
        <div className="hidden min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 sm:flex">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-xs font-medium" title={orgao!.razaoSocial}>
            {orgaoLabel}
          </span>
          {orgao!.uf && (
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              · {orgao!.esfera}/{orgao!.uf}
            </span>
          )}
        </div>
      )}

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
