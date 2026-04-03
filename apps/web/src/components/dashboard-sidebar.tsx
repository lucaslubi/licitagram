'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NotificationBell } from '@/components/notification-bell'

interface NavItem {
  href: string
  label: string
  separator?: boolean
}

interface DashboardSidebarProps {
  navItems: NavItem[]
  isAdmin: boolean
  userName: string
  userEmail: string
  userInitial: string
  planName: string | null
  companySwitcher?: React.ReactNode
}

const COLLAPSED_KEY = 'sidebar-collapsed'

/** Map nav hrefs to element IDs used by the onboarding tour */
const NAV_TOUR_IDS: Record<string, string> = {
  '/map': 'nav-map',
  '/opportunities': 'nav-opportunities',
  '/pipeline': 'nav-pipeline',
  '/dashboard': 'nav-dashboard',
  '/competitors': 'nav-competitors',
  '/price-history': 'nav-precos',
  '/bot': 'nav-bot',
  '/documents': 'nav-certidoes',
  '/drive': 'nav-drive',
  '/proposals': 'nav-propostas',
  '/company': 'nav-empresa',
  '/settings': 'nav-settings',
}

export function DashboardSidebar({
  navItems,
  isAdmin,
  userName,
  userEmail,
  userInitial,
  planName,
  companySwitcher,
}: DashboardSidebarProps) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  // Restore collapsed state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY)
      if (stored === 'true') setCollapsed(true)
    } catch {}
  }, [])

  // Persist collapsed state
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(COLLAPSED_KEY, String(next)) } catch {}
      return next
    })
  }

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Close sidebar on escape key
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  // Get initials for collapsed nav items
  function getInitial(label: string) {
    return label.charAt(0).toUpperCase()
  }

  const sidebarContent = (
    <>
      <div className={`mx-3 mt-3 mb-2 rounded-xl bg-[#1a1c1f] border border-[#2d2f33] ${collapsed ? 'p-2 flex justify-center' : 'p-4 flex items-center justify-center'}`}>
        {collapsed ? (
          <Image src="/logo-only.png" alt="Licitagram" width={200} height={200} className="h-8 w-8 object-contain" />
        ) : (
          <Image src="/logo-login.png" alt="Licitagram" width={880} height={198} className="h-16 w-auto" />
        )}
      </div>

      {/* Notification Bell */}
      <div className={`flex justify-end px-3 ${collapsed ? 'justify-center' : ''}`}>
        <NotificationBell />
      </div>

      {/* Company Switcher (Enterprise multi-CNPJ) */}
      {companySwitcher && (
        <>
          {companySwitcher}
          <div className="mx-4 h-px bg-[#2d2f33]" />
        </>
      )}

      <nav className={`flex-1 ${collapsed ? 'p-1.5' : 'p-3'} space-y-0.5 mt-2`}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <div key={item.href}>
              {item.separator && (
                <div className="mx-1 my-2 h-px bg-[#2d2f33]" />
              )}
              <Link
                href={item.href}
                id={NAV_TOUR_IDS[item.href]}
                title={collapsed ? item.label : undefined}
                className={`flex items-center ${
                  collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                } rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[#F43E01] text-white'
                    : 'text-gray-500 hover:bg-[#1a1c1f] hover:text-white'
                }`}
              >
                {collapsed ? (
                  <span className="text-[13px] font-bold">{getInitial(item.label)}</span>
                ) : (
                  item.label
                )}
              </Link>
            </div>
          )
        })}

        {isAdmin && (
          <>
            <div className="mx-1 my-2 h-px bg-[#2d2f33]" />
            <Link
              href="/admin"
              title={collapsed ? 'Admin' : undefined}
              className={`flex items-center ${
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
              } rounded-lg text-[13px] font-medium transition-all duration-150 ${
                pathname.startsWith('/admin')
                  ? 'bg-[#1a1c1f] text-amber-300'
                  : 'text-amber-400 hover:bg-[#1a1c1f] hover:text-amber-300'
              }`}
            >
              {collapsed ? 'A' : 'Admin'}
            </Link>
          </>
        )}
      </nav>

      <div className="mx-4 h-px bg-[#2d2f33]" />

      <div className={`p-4 ${collapsed ? 'px-2' : ''}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center" title={userName || userEmail}>
              <span className="text-brand text-[13px] font-semibold">
                {userInitial}
              </span>
            </div>
            <form action={signOut}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-gray-500 hover:text-gray-300 hover:bg-[#1a1c1f] px-2"
                title="Sair"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </Button>
            </form>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                <span className="text-brand text-[13px] font-semibold">
                  {userInitial}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-300 truncate">
                  {userName || userEmail}
                </p>
                {planName && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-[#2d2f33] text-gray-500 mt-0.5">
                    {planName}
                  </Badge>
                )}
              </div>
            </div>
            <form action={signOut}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-gray-500 hover:text-gray-300 hover:bg-[#1a1c1f]"
              >
                Sair
              </Button>
            </form>
          </>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-[#111214] border-b border-[#2d2f33] flex items-center px-4 gap-3">
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1a1c1f] transition-colors"
          aria-label="Abrir menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Image src="/logo-login.png" alt="Licitagram" width={880} height={198} className="h-12 w-auto" />
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile sidebar (slide-in) */}
      <aside
        className={`md:hidden fixed top-0 left-0 z-50 h-full w-72 bg-[#111214] flex flex-col transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Close button */}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1a1c1f] transition-colors"
          aria-label="Fechar menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar (collapsible) */}
      <aside
        className={`hidden md:flex border-r border-[#2d2f33] bg-[#111214] flex-col shrink-0 relative transition-all duration-300 ease-in-out ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {sidebarContent}

        {/* Collapse/Expand toggle button */}
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-[#1a1c1f] border border-[#2d2f33] flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#2d2f33] transition-colors shadow-md"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-300 ${collapsed ? 'rotate-0' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </aside>
    </>
  )
}
