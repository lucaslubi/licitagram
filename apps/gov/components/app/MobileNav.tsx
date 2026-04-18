'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Logo } from './Logo'
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from '@/lib/constants/navigation'
import { cn } from '@/lib/utils'

export function MobileNav() {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const active = isActive(item.href)
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
        )}
      >
        <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
        {item.label}
      </Link>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 px-3 pt-6">
        <div className="px-2 pb-4">
          <Logo />
        </div>
        <nav className="flex flex-col gap-1">
          {PRIMARY_NAV.map(renderItem)}
          <div className="my-2 border-t border-border" />
          {SECONDARY_NAV.map(renderItem)}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
