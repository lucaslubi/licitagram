'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface NavItem {
  href: string
  label: string
}

interface DashboardSidebarProps {
  navItems: NavItem[]
  isAdmin: boolean
  userName: string
  userEmail: string
  userInitial: string
  planName: string | null
}

export function DashboardSidebar({
  navItems,
  isAdmin,
  userName,
  userEmail,
  userInitial,
  planName,
}: DashboardSidebarProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

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

  const sidebarContent = (
    <>
      <div className="p-6">
        <Image src="/logo-branca.png" alt="Licitagram" width={440} height={99} className="h-[5.85rem] w-auto" />
      </div>

      <div className="mx-4 h-px bg-gray-700" />

      <nav className="flex-1 p-3 space-y-0.5 mt-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          )
        })}

        {isAdmin && (
          <>
            <div className="mx-1 my-2 h-px bg-gray-800" />
            <Link
              href="/admin"
              className={`flex items-center px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                pathname.startsWith('/admin')
                  ? 'bg-gray-800 text-amber-300'
                  : 'text-amber-400 hover:bg-gray-800 hover:text-amber-300'
              }`}
            >
              Admin
            </Link>
          </>
        )}
      </nav>

      <div className="mx-4 h-px bg-gray-700" />

      <div className="p-4">
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
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-600 text-gray-500 mt-0.5">
                {planName}
              </Badge>
            )}
          </div>
        </div>
        <form action={signOut}>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-gray-500 hover:text-gray-300 hover:bg-gray-800"
          >
            Sair
          </Button>
        </form>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-3">
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          aria-label="Abrir menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Image src="/logo-branca.png" alt="Licitagram" width={293} height={68} className="h-[3.94rem] w-auto" />
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
        className={`md:hidden fixed top-0 left-0 z-50 h-full w-72 bg-gray-900 flex flex-col transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Close button */}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          aria-label="Fechar menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar (always visible) */}
      <aside className="hidden md:flex w-64 border-r border-gray-700 bg-gray-900 flex-col shrink-0">
        {sidebarContent}
      </aside>
    </>
  )
}
