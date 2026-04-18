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
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
      )}
    >
      {active && (
        <>
          <span className="absolute inset-0 rounded-lg bg-gradient-brand-soft" aria-hidden />
          <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-gradient-brand" aria-hidden />
        </>
      )}
      <Icon
        className={cn(
          'relative h-4 w-4 shrink-0 transition-colors',
          active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
        )}
      />
      <span className="relative flex-1">{item.label}</span>
      {item.shortcut && (
        <kbd className="relative hidden font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70 lg:inline">
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
    <aside className="relative hidden w-64 shrink-0 flex-col border-r border-border/60 bg-surface-darker/90 backdrop-blur-xl lg:flex">
      <div
        className="pointer-events-none absolute -left-16 top-0 h-72 w-72 rounded-full bg-primary/10 blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-20 bottom-10 h-64 w-64 rounded-full bg-accent/8 blur-[110px]"
        aria-hidden
      />
      <div className="relative flex h-20 items-center border-b border-border/60 px-5">
        <Link href="/dashboard" className="inline-flex">
          <Logo size="lg" />
        </Link>
      </div>
      <nav className="relative flex flex-1 flex-col gap-1 overflow-y-auto p-3 premium-scroll">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <div className="my-2 border-t border-border/60" />
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
      <div className="relative border-t border-border/60 p-3 text-[11px] text-muted-foreground">
        <p>Lei 14.133/2021 · Compliance TCU</p>
      </div>
    </aside>
  )
}
