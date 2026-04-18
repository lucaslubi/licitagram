'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useTheme } from 'next-themes'
import { Plus, FileText, Search, Moon, Sun, Monitor, LifeBuoy, LogOut } from 'lucide-react'
import { PRIMARY_NAV, SECONDARY_NAV } from '@/lib/constants/navigation'
import { signOutAction } from '@/lib/auth/actions'

export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const { setTheme } = useTheme()

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const run = React.useCallback(
    (fn: () => void) => {
      setOpen(false)
      fn()
    },
    [],
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar ações, navegar, criar..." />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>

        <CommandGroup heading="Ações rápidas">
          <CommandItem onSelect={() => run(() => router.push('/processos/novo'))}>
            <Plus />
            Novo processo
            <CommandShortcut>N P</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push('/pca/novo'))}>
            <FileText />
            Nova campanha PCA
            <CommandShortcut>N C</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push('/catalogo'))}>
            <Search />
            Consultar item no catálogo
            <CommandShortcut>/</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navegar">
          {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => {
            const Icon = item.icon
            return (
              <CommandItem key={item.href} onSelect={() => run(() => router.push(item.href))}>
                <Icon />
                {item.label}
                {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
              </CommandItem>
            )
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Tema">
          <CommandItem onSelect={() => run(() => setTheme('light'))}>
            <Sun />
            Modo claro
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme('dark'))}>
            <Moon />
            Modo escuro
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme('system'))}>
            <Monitor />
            Seguir sistema
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Conta">
          <CommandItem onSelect={() => run(() => router.push('/ajuda'))}>
            <LifeBuoy />
            Ajuda e suporte
          </CommandItem>
          <CommandItem onSelect={() => run(() => signOutAction())}>
            <LogOut />
            Sair
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
