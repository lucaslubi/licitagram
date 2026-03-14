'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AdminNavItem {
  href: string
  label: string
}

interface AdminSidebarProps {
  visibleItems: AdminNavItem[]
  userEmail: string
}

export function AdminSidebar({ visibleItems, userEmail }: AdminSidebarProps) {
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
      <div className="p-4 border-b border-gray-200">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Voltar ao painel
        </Link>
        <h2 className="text-lg font-bold mt-2 text-gray-900">Admin</h2>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <p className="text-[11px] text-gray-400">{userEmail}</p>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3">
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          aria-label="Abrir menu admin"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-sm font-bold text-gray-900">Admin</span>
        <Link href="/dashboard" className="ml-auto text-xs text-gray-500 hover:text-gray-700">
          &larr; Painel
        </Link>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile sidebar (slide-in) */}
      <aside
        className={`md:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white flex flex-col transform transition-transform duration-300 ease-in-out shadow-xl ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          aria-label="Fechar menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar (always visible) */}
      <aside className="hidden md:flex w-56 border-r border-gray-200 bg-white flex-col min-h-screen shrink-0">
        {sidebarContent}
      </aside>
    </>
  )
}
