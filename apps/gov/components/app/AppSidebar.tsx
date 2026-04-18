'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from './Logo'
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from '@/lib/constants/navigation'
import { cn } from '@/lib/utils'

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-secondary text-foreground'
          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
      <span className="flex-1">{item.label}</span>
      {item.shortcut && (
        <kbd className="hidden font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70 lg:inline">
          {item.shortcut}
        </kbd>
      )}
    </Link>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/50 lg:flex">
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link href="/dashboard">
          <Logo />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <div className="my-2 border-t border-border" />
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
      <div className="border-t border-border p-3 text-[11px] text-muted-foreground">
        <p>Lei 14.133/2021 · Compliance TCU</p>
      </div>
    </aside>
  )
}
