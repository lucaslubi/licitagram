'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompanyInfo {
  id: string
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  is_default?: boolean
}

interface CompanyContextValue {
  /** Currently active company ID */
  activeCompanyId: string | null
  /** All companies the user belongs to */
  companies: CompanyInfo[]
  /** Whether the user can add more companies (based on plan limit) */
  canAddMore: boolean
  /** Maximum companies allowed by the plan */
  maxCompanies: number
  /** Whether the user has multi-company feature enabled */
  isMultiCompany: boolean
  /** Switch to a different company */
  switchCompany: (companyId: string) => void
  /** Add a company to the local list (after creation) */
  addCompany: (company: CompanyInfo) => void
}

const CompanyCtx = createContext<CompanyContextValue | null>(null)

const ACTIVE_COMPANY_KEY = 'licitagram-active-company'

// ─── Provider ───────────────────────────────────────────────────────────────

interface CompanyProviderProps {
  children: ReactNode
  /** Companies the user belongs to (from server) */
  initialCompanies: CompanyInfo[]
  /** The user's default/primary company ID */
  defaultCompanyId: string | null
  /** Max companies allowed by the subscription plan */
  maxCompanies: number
  /** Whether the plan allows multi_cnpj */
  multiCnpjEnabled: boolean
}

export function CompanyProvider({
  children,
  initialCompanies,
  defaultCompanyId,
  maxCompanies,
  multiCnpjEnabled,
}: CompanyProviderProps) {
  const [companies, setCompanies] = useState<CompanyInfo[]>(initialCompanies)

  // Resolve initial active company: localStorage > default > first
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return defaultCompanyId
    try {
      const stored = localStorage.getItem(ACTIVE_COMPANY_KEY)
      if (stored && initialCompanies.some((c) => c.id === stored)) {
        return stored
      }
    } catch {}
    return defaultCompanyId || initialCompanies[0]?.id || null
  })

  // Persist active company to localStorage
  useEffect(() => {
    if (activeCompanyId) {
      try {
        localStorage.setItem(ACTIVE_COMPANY_KEY, activeCompanyId)
      } catch {}
    }
  }, [activeCompanyId])

  const switchCompany = useCallback(
    async (companyId: string) => {
      if (companies.some((c) => c.id === companyId)) {
        setActiveCompanyId(companyId)
        // Persist to database so server-side pages use the correct company
        try {
          await fetch('/api/switch-company', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId }),
          })
        } catch {}
        // Reload page to refresh server-side data for the new company
        window.location.reload()
      }
    },
    [companies],
  )

  const addCompany = useCallback((company: CompanyInfo) => {
    setCompanies((prev) => {
      if (prev.some((c) => c.id === company.id)) return prev
      return [...prev, company]
    })
  }, [])

  const canAddMore = multiCnpjEnabled && companies.length < maxCompanies
  const isMultiCompany = multiCnpjEnabled && companies.length > 1

  return (
    <CompanyCtx.Provider
      value={{
        activeCompanyId,
        companies,
        canAddMore,
        maxCompanies,
        isMultiCompany,
        switchCompany,
        addCompany,
      }}
    >
      {children}
    </CompanyCtx.Provider>
  )
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useCompanyContext(): CompanyContextValue {
  const ctx = useContext(CompanyCtx)
  if (!ctx) {
    throw new Error('useCompanyContext must be used within a CompanyProvider')
  }
  return ctx
}
