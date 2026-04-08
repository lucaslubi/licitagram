'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { NotificationBell } from '@/components/notification-bell'
import {
  navigationGroups,
  accountItems,
  adminItem,
  NAV_TOUR_IDS,
  type NavItemConfig,
} from '@/config/navigation'
import type { PlanFeatureKey } from '@licitagram/shared'
import { LogOut, ChevronsUpDown } from 'lucide-react'
import { GlobalPlaybook } from '@/components/global-playbook'

interface DashboardSidebarProps {
  isAdmin: boolean
  userName: string
  userEmail: string
  userInitial: string
  planName: string | null
  companySwitcher?: React.ReactNode
  /** Plan features available to this user (for filtering nav items) */
  enabledFeatures?: PlanFeatureKey[]
}

export function DashboardSidebar({
  isAdmin,
  userName,
  userEmail,
  userInitial,
  planName,
  companySwitcher,
  enabledFeatures = [],
}: DashboardSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Close sidebar on escape key
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    if (mobileOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [mobileOpen])

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [mobileOpen])

  function isItemVisible(item: NavItemConfig): boolean {
    if (!item.requiredFeature) return true
    return enabledFeatures.includes(item.requiredFeature)
  }

  function isActive(href: string): boolean {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname === href || pathname.startsWith(href + '/')
  }

  // ─── Shared sidebar content ─────────────────────────────────────────────

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo — compact */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <Image src="/logo-only.png" alt="Licitagram" width={200} height={200} className="h-7 w-7 object-contain" />
        <span className="text-[13px] font-bold tracking-[0.04em] text-foreground uppercase">Licitagram</span>
      </div>

      {/* Company selector + notification bell */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        {companySwitcher ? (
          <div className="flex-1 min-w-0">{companySwitcher}</div>
        ) : (
          <div className="flex-1" />
        )}
        <NotificationBell />
      </div>

      {/* Navigation groups */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2 sidebar-scrollbar">
        {navigationGroups.map((group) => {
          const visibleItems = group.items.filter(isItemVisible)
          if (visibleItems.length === 0) return null

          return (
            <div key={group.label} className="mb-5">
              <span className="block px-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 select-none">
                {group.label}
              </span>
              <ul className="space-y-px">
                {visibleItems.map((item) => {
                  const active = isActive(item.href)
                  const Icon = item.icon
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        id={NAV_TOUR_IDS[item.href]}
                        className={`sidebar-nav-item ${active ? 'sidebar-nav-item-active' : ''}`}
                      >
                        <Icon size={16} className="sidebar-nav-icon" />
                        <span className="sidebar-nav-label">{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      {/* Divider */}
      <div className="mx-4 h-px bg-border" />

      {/* Account section */}
      <div className="px-2 py-2">
        <ul className="space-y-px">
          {accountItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  id={NAV_TOUR_IDS[item.href]}
                  className={`sidebar-nav-item ${active ? 'sidebar-nav-item-active' : ''}`}
                >
                  <Icon size={16} className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Admin (conditional) */}
      {isAdmin && (
        <div className="px-2 pb-1">
          <Link
            href={adminItem.href}
            className={`sidebar-nav-item ${pathname.startsWith('/admin') ? 'sidebar-nav-item-active' : ''}`}
          >
            <adminItem.icon size={16} className="sidebar-nav-icon" />
            <span className="sidebar-nav-label">{adminItem.label}</span>
          </Link>
        </div>
      )}

      {/* Guide & Playbook */}
      <div className="px-2 pb-1 mt-auto">
        <GlobalPlaybook />
      </div>

      {/* User menu — footer */}
      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-semibold text-primary">{userInitial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-foreground truncate">{userName || userEmail}</p>
            {planName && (
              <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-[0.05em]">{planName}</p>
            )}
          </div>
          <form action={signOut}>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-muted-foreground hover:text-foreground opacity-0 group-hover/sidebar:opacity-100 transition-opacity"
              title="Sair"
            >
              <LogOut size={14} />
            </Button>
          </form>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-background border-b border-border flex items-center px-4 gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label="Abrir menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Image src="/logo-only.png" alt="Licitagram" width={200} height={200} className="h-7 w-7 object-contain" />
        <span className="text-[13px] font-bold tracking-[0.04em] text-foreground uppercase">Licitagram</span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar (slide-in) */}
      <aside
        className={`md:hidden fixed top-0 left-0 z-50 h-full w-[220px] bg-background flex flex-col transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors z-10"
          aria-label="Fechar menu"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar — fixed 220px */}
      <aside className="hidden md:flex group/sidebar w-[220px] shrink-0 border-r border-border bg-background flex-col h-screen sticky top-0">
        {sidebarContent}
      </aside>
    </>
  )
}
