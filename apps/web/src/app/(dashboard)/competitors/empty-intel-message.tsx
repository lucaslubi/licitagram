'use client'

import Link from 'next/link'

interface Props {
  /** CNAE principal atual da empresa (pode ser string vazia ou inválida) */
  cnaePrincipal: string | null | undefined
  /** Quantos competitor_stats existem hoje para o CNAE da empresa */
  competitorStatsCount: number
}

const isValidCnae = (s: string | null | undefined): boolean => /^\d{7}$/.test((s || '').replace(/\D/g, ''))

export function EmptyIntelMessage({ cnaePrincipal, competitorStatsCount }: Props) {
  const hasCnae = isValidCnae(cnaePrincipal)

  // Caso A — CNAE vazio ou inválido
  if (!hasCnae) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground mb-1">
              Precisamos do seu CNAE para começar a análise
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              A Inteligência Competitiva depende do código CNAE da sua empresa para encontrar concorrentes relevantes,
              gerar o Radar Semanal e classificar automaticamente diretos, indiretos e parceiros potenciais.
              Leva menos de 30 segundos — basta digitar o CNPJ e nós buscamos na Receita Federal.
            </p>
            <Link
              href="/company"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Completar perfil agora
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Caso B — CNAE válido mas sem competitor_stats no nicho
  if (competitorStatsCount === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground mb-1">
              Seu nicho é específico — ainda coletando dados
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Estamos expandindo a cobertura de concorrentes para o CNAE <span className="font-mono text-foreground">{cnaePrincipal}</span>.
              A análise detalhada ficará disponível conforme mais editais desse segmento forem processados.
              Enquanto isso, visite o <Link href="/map" className="text-foreground underline hover:no-underline">mapa de oportunidades</Link> para ver matches relevantes.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Caso C — CNAE válido + stats existem mas classificação ainda rodando
  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground mb-1">
            Analisando seus concorrentes em tempo real
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Nossa IA está classificando os concorrentes do seu nicho como diretos, indiretos ou parceiros potenciais.
            Isso geralmente leva 2 a 5 minutos após o cadastro. Atualize a página em instantes ou volte daqui a pouco.
          </p>
        </div>
      </div>
    </div>
  )
}
