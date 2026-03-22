'use client'

import { useState, useRef, useEffect } from 'react'
import { useCompanyContext } from '@/contexts/company-context'
import { AddCompanyDialog } from './add-company-dialog'

/** Format CNPJ: 12345678000199 → 12.345.678/0001-99 */
function formatCNPJ(cnpj: string): string {
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14) return cnpj
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
}

interface CompanySwitcherProps {
  collapsed?: boolean
}

export function CompanySwitcher({ collapsed = false }: CompanySwitcherProps) {
  const { activeCompanyId, companies, canAddMore, switchCompany, isMultiCompany } =
    useCompanyContext()
  const [open, setOpen] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const activeCompany = companies.find((c) => c.id === activeCompanyId)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  // Don't render if only 1 company and can't add more
  if (companies.length <= 1 && !canAddMore) return null

  const displayName = activeCompany
    ? activeCompany.nome_fantasia || activeCompany.razao_social
    : 'Selecionar empresa'

  if (collapsed) {
    return (
      <div className="px-2 py-2">
        <button
          onClick={() => setOpen(!open)}
          title={displayName}
          className="w-full flex items-center justify-center p-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-2" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
      >
        {/* Building icon */}
        <svg className="w-4 h-4 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
        <span className="truncate flex-1 text-left">{displayName}</span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="mt-1 rounded-lg bg-gray-800 border border-gray-700 shadow-lg overflow-hidden z-50">
          <div className="max-h-48 overflow-y-auto">
            {companies.map((company) => {
              const isActive = company.id === activeCompanyId
              const name = company.nome_fantasia || company.razao_social
              return (
                <button
                  key={company.id}
                  onClick={() => {
                    if (!isActive) switchCompany(company.id)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2.5 text-[12px] transition-colors ${
                    isActive
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:bg-gray-750 hover:text-gray-200'
                  }`}
                >
                  <p className="font-medium truncate">{name}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {formatCNPJ(company.cnpj)}
                  </p>
                </button>
              )
            })}
          </div>

          {canAddMore && (
            <>
              <div className="h-px bg-gray-700" />
              <button
                onClick={() => {
                  setOpen(false)
                  setShowAddDialog(true)
                }}
                className="w-full text-left px-3 py-2.5 text-[12px] font-medium text-brand hover:bg-gray-750 transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Adicionar Empresa
              </button>
            </>
          )}
        </div>
      )}

      {/* Add Company Dialog */}
      {showAddDialog && (
        <AddCompanyDialog onClose={() => setShowAddDialog(false)} />
      )}
    </div>
  )
}
