import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UpgradeButton } from './upgrade-button'
import { AutoCheckout } from './auto-checkout'
import { Suspense } from 'react'
import { getUserWithPlan } from '@/lib/auth-helpers'
import { getActivePlans, checkMatchLimit } from '@/lib/plans'
import type { Plan, PlanFeatures } from '@licitagram/shared'

/** Format cents to BRL currency string */
function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

/** Static feature lists per plan tier for display */
const PLAN_FEATURES: Record<string, string[]> = {
  essencial: [
    '+200.000 licitações monitoradas/mês',
    'AI Matching com score 0-100 (até 50 matches/mês)',
    'Mapa de Inteligência geográfico',
    'Filtros avançados',
    'Busca no texto do edital',
    'Pipeline Kanban completo',
    'Dashboard com métricas e tendências',
    'Gestão de Certidões + alertas de vencimento',
    'Verificação automática de sanções',
    'Alertas WhatsApp e Telegram (10/dia)',
    'Preços de Mercado (5 buscas/dia)',
    '1 usuário',
    'Suporte por email',
  ],
  profissional: [
    'Tudo do Essencial +',
    'AI Matching ilimitado',
    'Alertas ilimitados',
    'Gerador de Propostas Comerciais (Lei 14.133)',
    'Pesquisa de Preços IN 65/2021',
    'Preços de Mercado ilimitados + tendência',
    '"Pergunte ao Edital" — chat IA',
    'Análise de edital por IA',
    'Compliance Checker',
    'Inteligência Competitiva (5 módulos)',
    'Ranking de Concorrentes por IA',
    'Janelas de Oportunidade',
    'Drive institucional',
    'Auto-fill CNPJ',
    'Export Excel e CSV',
    'Até 5 usuários',
    'Suporte prioritário',
  ],
  enterprise: [
    'Tudo do Profissional +',
    'Robô de Lances com IA estratégica',
    'Pré-Disputa',
    'Sugestão de lance por IA',
    'Detecção de Anomalias (5 tipos)',
    'Grafo Societário (67M+ CNPJs)',
    'Relatório de Inteligência Setorial',
    'Multi-CNPJ',
    'API de integração',
    'Usuários ilimitados',
    'Suporte dedicado',
  ],
}

/** Map plan slug to display name */
const PLAN_DISPLAY_NAMES: Record<string, string> = {
  starter: 'Essencial',
  essencial: 'Essencial',
  professional: 'Profissional',
  profissional: 'Profissional',
  enterprise: 'Enterprise',
}

/** Map plan slug to badge text */
const PLAN_BADGES: Record<string, string> = {
  professional: 'Mais popular',
  profissional: 'Mais popular',
  enterprise: 'Completo',
}

/** Map plan features to user-facing feature list */
function planFeatureList(plan: Plan): string[] {
  const slug = plan.slug?.toLowerCase() || ''

  // Try static feature list first
  if (PLAN_FEATURES[slug]) return PLAN_FEATURES[slug]

  // Fallback: dynamic feature list from plan data
  const features: string[] = []
  const f = plan.features as PlanFeatures

  if (plan.max_matches_per_month === null) {
    features.push('Matches ilimitados')
  } else {
    features.push(`Até ${plan.max_matches_per_month} matches/mês`)
  }

  if (plan.max_users === null) {
    features.push('Usuários ilimitados')
  } else if (plan.max_users === 1) {
    features.push('1 usuário')
  } else {
    features.push(`Até ${plan.max_users} usuários`)
  }

  if (f.portais?.length > 0) {
    if (f.portais.length <= 2) {
      features.push(`Portais: ${f.portais.join(', ').toUpperCase()}`)
    } else {
      features.push('Todos os portais')
    }
  }

  if (f.chat_ia) features.push('"Pergunte ao Edital" — chat IA')
  if (f.compliance_checker) features.push('Compliance Checker')
  if (f.competitive_intel) features.push('Inteligência Competitiva')
  if (f.export_excel) features.push('Export Excel e CSV')
  if (f.multi_cnpj) features.push('Multi-CNPJ')
  if (f.api_integration) features.push('API de integração')
  if (f.proposal_generator) features.push('Gerador de Propostas Comerciais')
  if (f.priority_support) features.push('Suporte prioritário')

  if (plan.max_alerts_per_day === null) {
    features.push('Alertas ilimitados')
  } else {
    features.push(`${plan.max_alerts_per_day} alertas/dia`)
  }

  return features
}

/** Get display name for a plan */
function getPlanDisplayName(plan: Plan): string {
  return PLAN_DISPLAY_NAMES[plan.slug?.toLowerCase() || ''] || plan.name
}

/** Get badge for a plan */
function getPlanBadge(plan: Plan): string | null {
  return PLAN_BADGES[plan.slug?.toLowerCase() || ''] || null
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string; expired?: string; upgrade?: string; plan?: string; billing?: string }>
}) {
  const params = await searchParams
  const user = await getUserWithPlan()
  if (!user) redirect('/login')

  const plans = await getActivePlans()
  const matchLimit = user.companyId ? await checkMatchLimit(user.companyId) : null

  const currentPlanSlug = user.plan?.slug || null
  const status = user.subscription?.status || null

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Plano e Cobrança</h1>

      <Suspense>
        <AutoCheckout plans={plans.map(p => ({ id: p.id, slug: p.slug, name: p.name }))} />
      </Suspense>

      {params.success && (
        <div className="mb-6 p-4 bg-emerald-900/20 border border-emerald-900/30 rounded-lg text-emerald-400 text-sm">
          Assinatura realizada com sucesso! Seu plano já está ativo.
        </div>
      )}

      {params.canceled && (
        <div className="mb-6 p-4 bg-amber-900/20 border border-amber-900/30 rounded-lg text-amber-400 text-sm">
          Checkout cancelado. Escolha um plano quando estiver pronto.
        </div>
      )}

      {params.expired && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-900/30 rounded-lg text-red-400 text-sm">
          Sua assinatura expirou ou foi cancelada. Escolha um plano para continuar usando a plataforma.
        </div>
      )}

      {params.upgrade && (
        <div className="mb-6 p-4 bg-blue-900/20 border border-blue-900/30 rounded-lg text-blue-400 text-sm">
          A funcionalidade que você tentou acessar requer um plano superior.
          Faça upgrade para desbloquear.
        </div>
      )}

      {/* Current plan */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Plano Atual</CardTitle>
        </CardHeader>
        <CardContent>
          {user.plan ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-lg font-bold">{user.plan.name}</p>
                  <p className="text-sm text-gray-400">
                    {formatBRL(user.plan.price_cents)}/{user.plan.billing_interval === 'year' ? 'ano' : 'mês'}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    status === 'active'
                      ? 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30'
                      : status === 'trialing'
                        ? 'bg-blue-900/20 text-blue-400 border-blue-900/30'
                        : status === 'past_due'
                          ? 'bg-amber-900/20 text-amber-400 border-amber-900/30'
                          : 'bg-red-900/20 text-red-400 border-red-900/30'
                  }
                >
                  {status === 'active' ? 'Ativo'
                    : status === 'trialing' ? 'Trial'
                    : status === 'past_due' ? 'Pagamento pendente'
                    : status || 'N/A'}
                </Badge>
              </div>

              {/* Usage indicators */}
              {matchLimit && (
                <div className="bg-[#1a1c1f] rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-gray-300">Uso do mês</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Matches</span>
                        <span>
                          {matchLimit.used}
                          {matchLimit.limit !== null ? ` / ${matchLimit.limit}` : ' (ilimitado)'}
                        </span>
                      </div>
                      {matchLimit.limit !== null && (
                        <div className="w-full bg-[#2d2f33] rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              matchLimit.used / matchLimit.limit > 0.9
                                ? 'bg-red-500'
                                : matchLimit.used / matchLimit.limit > 0.7
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, (matchLimit.used / matchLimit.limit) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-gray-400 mb-2">Você está no plano gratuito (trial).</p>
              <p className="text-sm text-gray-400">Escolha um plano abaixo para desbloquear todas as funcionalidades.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available plans */}
      <h2 className="text-lg font-semibold mb-4">Planos Disponíveis</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrent = currentPlanSlug === plan.slug
          const features = planFeatureList(plan)
          const displayName = getPlanDisplayName(plan)
          const badge = getPlanBadge(plan)

          return (
            <Card key={plan.id} className={`relative ${isCurrent ? 'border-brand border-2' : badge ? 'border-brand/50 border' : ''}`}>
              {badge && !isCurrent && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand text-white text-[10px] font-semibold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">
                  {badge}
                </span>
              )}
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {displayName}
                  {isCurrent && <Badge className="bg-brand/10 text-brand border-brand/20" variant="outline">Atual</Badge>}
                </CardTitle>
                <p className="text-2xl font-bold">
                  {formatBRL(plan.price_cents)}
                  <span className="text-sm font-normal text-gray-400">/mês</span>
                </p>
                {plan.description && (
                  <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
                )}
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="text-emerald-500 shrink-0">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {!isCurrent && <UpgradeButton planId={plan.id} label={`Assinar ${displayName}`} />}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
