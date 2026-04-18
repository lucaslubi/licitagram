'use client'

import { useTransition } from 'react'
import { LogOut, Settings, ShieldCheck, User } from 'lucide-react'
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
import { signOutAction } from '@/lib/auth/actions'

interface Props {
  name?: string | null
  email?: string | null
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

export function UserMenu({ name, email }: Props) {
  const [pending, startTransition] = useTransition()
  const onSignOut = () => startTransition(() => signOutAction())
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
        <DropdownMenuItem asChild>
          <a href="/configuracoes/seguranca">
            <ShieldCheck className="mr-2 h-4 w-4" /> Segurança & MFA
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} disabled={pending}>
          <LogOut className="mr-2 h-4 w-4" /> {pending ? 'Saindo...' : 'Sair'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
