'use client'

import { useFraudAlerts } from './FraudAlertBadges'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'border-l-red-500 bg-red-500/5',
  HIGH: 'border-l-orange-500 bg-orange-500/5',
  MEDIUM: 'border-l-yellow-500 bg-yellow-500/5',
  LOW: 'border-l-gray-500 bg-gray-500/5',
}
const SEVERITY_ICONS: Record<string, string> = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  MEDIUM: '🟡',
  LOW: '⚪',
}
const ALERT_LABELS: Record<string, string> = {
  SOCIO_EM_COMUM: 'Socio em comum',
  EMPRESA_RECENTE: 'Empresa recente',
  CAPITAL_INCOMPATIVEL: 'Capital incompativel',
  EMPRESA_SANCIONADA: 'Empresa sancionada',
  ENDERECO_COMPARTILHADO: 'Endereco compartilhado',
}

interface Props {
  tenderId: string
  hasAccess: boolean // true for Enterprise plan
}

export function RiskAnalysisCard({ tenderId, hasAccess }: Props) {
  if (!hasAccess) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-[#2d2f33] rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-white">Analise de Risco</h3>
              <p className="text-sm text-gray-400 mt-1">
                Deteccao automatica de padroes de risco em licitacoes.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Disponivel no plano Enterprise
              </p>
            </div>
            <a
              href="/billing"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand/10 text-brand rounded-lg text-sm font-medium hover:bg-brand/20 transition-colors"
            >
              Fazer upgrade
            </a>
          </div>
        </CardContent>
      </Card>
    )
  }

  return <RiskAnalysisCardInner tenderId={tenderId} />
}

function RiskAnalysisCardInner({ tenderId }: { tenderId: string }) {
  const { alerts, loading } = useFraudAlerts(tenderId)

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Analise de Risco
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-4 bg-[#2d2f33] rounded animate-pulse w-3/4" />
            <div className="h-4 bg-[#2d2f33] rounded animate-pulse w-1/2" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const sorted = [...alerts].sort((a, b) =>
    (SEVERITY_ORDER[a.severity as keyof typeof SEVERITY_ORDER] || 3) -
    (SEVERITY_ORDER[b.severity as keyof typeof SEVERITY_ORDER] || 3)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Analise de Risco
          {sorted.length > 0 && (
            <span className="ml-auto text-xs font-normal text-amber-400 bg-amber-900/20 px-2 py-0.5 rounded-full">
              {sorted.length} alerta{sorted.length !== 1 ? 's' : ''}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-400">
            <span className="text-lg">✅</span>
            <span className="text-sm">Nenhuma anomalia detectada nesta licitacao</span>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((alert) => (
              <div
                key={alert.id}
                className={`border-l-2 rounded-r-lg p-3 ${SEVERITY_COLORS[alert.severity] || 'border-l-gray-500 bg-gray-500/5'}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm shrink-0">{SEVERITY_ICONS[alert.severity] || '⚪'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {ALERT_LABELS[alert.alert_type] || alert.alert_type}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{alert.detail}</p>
                    {alert.empresa_1 && alert.empresa_2 && (
                      <p className="text-[10px] text-gray-500 mt-1">
                        {alert.empresa_1} ↔ {alert.empresa_2}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
          Alertas sao padroes estatisticos que merecem investigacao. Nao sao confirmacao de irregularidade.
        </p>
      </CardContent>
    </Card>
  )
}
