'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface ConsultantPageContext {
  page: string
  summary: string
  data?: Record<string, unknown>
  suggestedQuestions?: string[]
}

interface ConsultantContextValue {
  pageContext: ConsultantPageContext
  setConsultantContext: (ctx: ConsultantPageContext) => void
}

const DEFAULT_CONTEXT: ConsultantPageContext = {
  page: 'dashboard',
  summary: 'Painel principal',
  suggestedQuestions: [
    'O que é o Licitagram?',
    'Como funciona o score de match?',
  ],
}

const ConsultantCtx = createContext<ConsultantContextValue | null>(null)

export function ConsultantProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContext] = useState<ConsultantPageContext>(DEFAULT_CONTEXT)

  const setConsultantContext = useCallback((ctx: ConsultantPageContext) => {
    setPageContext(ctx)
  }, [])

  return (
    <ConsultantCtx.Provider value={{ pageContext, setConsultantContext }}>
      {children}
    </ConsultantCtx.Provider>
  )
}

export function useConsultantContext(): ConsultantContextValue {
  const ctx = useContext(ConsultantCtx)
  if (!ctx) {
    throw new Error('useConsultantContext must be used within a ConsultantProvider')
  }
  return ctx
}
