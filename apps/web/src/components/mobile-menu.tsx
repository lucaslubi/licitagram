'use client'

import { useState } from 'react'
import Link from 'next/link'

const NAV_LINKS = [
  { href: '#inteligencia', label: 'Inteligência' },
  { href: '#mapa', label: 'Mapa' },
  { href: '#plataforma', label: 'Plataforma' },
  { href: '#pricing', label: 'Preços' },
  { href: '#governos', label: 'Para Governos' },
]

export function MobileMenu() {
  const [open, setOpen] = useState(false)

  return (
    <div className="lg:hidden">
      {/* Hamburger button */}
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={open}
        className="p-2 -mr-2 text-[#F43E01] hover:text-[#C23101] transition-colors"
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Dropdown overlay */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 top-[72px] bg-black/60 z-40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Menu panel */}
          <div className="absolute top-[72px] left-0 right-0 z-50 bg-[#0A0A0F] border-t border-white/[0.08]">
            <nav className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="px-4 py-3 rounded-lg text-[15px] font-medium text-white/60 hover:text-white hover:bg-white/[0.04] transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <hr className="my-3 border-white/[0.08]" />
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="px-4 py-3 rounded-lg text-[15px] font-medium text-white/60 hover:text-white hover:bg-white/[0.04] transition-colors"
              >
                Entrar
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="mx-4 mt-3 mb-1 text-center py-3.5 bg-[#F43E01] text-white rounded-full text-[15px] font-semibold hover:bg-[#D63600] transition-colors"
              >
                Solicitar acesso
              </Link>
            </nav>
          </div>
        </>
      )}
    </div>
  )
}
