'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useCompanyContext } from '@/contexts/company-context'
import { AddCompanyDialog } from './add-company-dialog'
import { removeCompanyAction } from '@/actions/multi-company'
import { formatCNPJ } from '@/lib/format'

interface CompanySwitcherProps {
  collapsed?: boolean
}

export function CompanySwitcher({ collapsed = false }: CompanySwitcherProps) {
  const { activeCompanyId, companies, canAddMore, switchCompany, isMultiCompany } =
    useCompanyContext()
  const [open, setOpen] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
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
    <div className="px-3 py-1.5" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-foreground hover:bg-secondary transition-colors border border-border"
        title={displayName}
      >
        <svg className="w-3.5 h-3.5 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
        <span className="truncate flex-1 text-left min-w-0">{displayName}</span>
        <svg
          className={`w-3 h-3 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
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
              const isDefault = company.is_default
              const name = company.nome_fantasia || company.razao_social
              const isConfirming = confirmDelete === company.id

              return (
                <div key={company.id} className={`flex items-center transition-colors ${
                  isActive ? 'bg-gray-700' : 'hover:bg-gray-750'
                }`}>
                  <button
                    onClick={() => {
                      if (!isActive) switchCompany(company.id)
                      setOpen(false)
                      setConfirmDelete(null)
                    }}
                    className={`flex-1 text-left px-3 py-2.5 text-[12px] ${
                      isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <p className="font-medium truncate">{name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {formatCNPJ(company.cnpj)}
                      {isDefault && <span className="ml-1 text-brand">(principal)</span>}
                    </p>
                  </button>

                  {/* Delete button — only for non-default, non-active, when more than 1 company */}
                  {!isDefault && companies.length > 1 && (
                    <div className="pr-2 shrink-0">
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              startTransition(async () => {
                                const result = await removeCompanyAction(company.id)
                                if (result.success) {
                                  setConfirmDelete(null)
                                  window.location.reload()
                                } else {
                                  alert(result.error || 'Erro ao remover')
                                  setConfirmDelete(null)
                                }
                              })
                            }}
                            disabled={isPending}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                          >
                            {isPending ? '...' : 'Sim'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-[#2d2f33] text-gray-400 hover:text-white transition-colors"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDelete(company.id)
                          }}
                          title="Remover empresa"
                          className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
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
