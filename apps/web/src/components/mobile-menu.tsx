'use client'

import { useState } from 'react'
import Link from 'next/link'

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Preços' },
  { href: '#testimonials', label: 'Depoimentos' },
  { href: '#faq', label: 'FAQ' },
]

export function MobileMenu() {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      {/* Hamburger button */}
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={open}
        className="p-2 -mr-2 text-[#69695D] hover:text-[#26292E] transition-colors"
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
            className="fixed inset-0 top-16 bg-black/20 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Menu panel */}
          <div className="absolute top-16 left-0 right-0 z-50 border-b border-black/[0.08] bg-[#FAFAF8] shadow-lg">
            <nav className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="px-4 py-3 rounded-lg text-body font-medium text-[#69695D] hover:text-[#26292E] hover:bg-black/[0.04] transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <hr className="my-2 border-black/[0.08]" />
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="px-4 py-3 rounded-lg text-body font-medium text-[#69695D] hover:text-[#26292E] hover:bg-black/[0.04] transition-colors"
              >
                Entrar
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="mx-4 mt-2 mb-1 text-center py-3 bg-[#F43E01] text-white rounded-[1000px] text-body font-medium hover:bg-[#C23101] transition-colors"
              >
                Criar Conta
              </Link>
            </nav>
          </div>
        </>
      )}
    </div>
  )
}
