'use client'

import { LogOut, Settings, User } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Props {
  name?: string | null
  email?: string | null
  /** Phase 1 stub — Phase 2 wires real signOut via Supabase. */
  onSignOut?: () => void
}

function initials(name?: string | null) {
  if (!name) return 'U'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function UserMenu({ name, email, onSignOut }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0" aria-label="Menu do usuário">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-xs">{initials(name ?? email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-0.5">
            <p className="text-sm font-medium">{name ?? 'Usuário'}</p>
            {email && <p className="text-xs text-muted-foreground">{email}</p>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/configuracoes">
            <User className="mr-2 h-4 w-4" /> Perfil
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/configuracoes">
            <Settings className="mr-2 h-4 w-4" /> Configurações
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
