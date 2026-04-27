import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatBRL, formatDate } from '@/lib/format'
import { getStripe } from '@/lib/stripe'
import { getActivePlans, checkMatchLimit } from '@/lib/plans'
import {
  ChangePlanButton,
  PortalButton,
  ReactivateButton,
  CancelTrigger,
} from './actions-bar'
import { AutoCheckout } from './auto-checkout'
import { UpgradeButton } from './upgrade-button'
import type { Plan, PlanFeatures } from '@licitagram/shared'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Assinatura · Licitagram' }

const PLAN_FEATURES_STATIC: Record<string, string[]> = {
  essencial: [
    'Telegram SmartAlerts (Notificações em tempo real)',
    '+200.000 licitações monitoradas/mês',
    'AI Matching com score 0-100 (50/mês)',
    'Pipeline Kanban e Dashboards',
    'Gestão de Certidões (13 tipos)',
    'Filtros avançados e Busca full-text',
    '1 usuário',
    'Suporte por email',
  ],
  starter: [
    'Telegram SmartAlerts',
    'AI Matching com score 0-100',
    'Pipeline Kanban',
    '1 usuário',
  ],
  profissional: [
    'Tudo do Essencial +',
    'WhatsApp FastMatch (Alertas instantâneos)',
    'Licitagram GeoRadar (Visão estratégica regional)',
    'AI Matching Ilimitado',
    '"Pergunte ao Edital" (Chat IA com PDF)',
    'Compliance Checker e Análise de Risco',
    'Gerador de Propostas (Lei 14.133)',
    'Pesquisa de Preços IN 65/2021',
    'Inteligência Competitiva (5 módulos)',
    'Até 5 usuários',
    'Suporte prioritário',
  ],
  professional: [
    'WhatsApp FastMatch',
    'AI Matching ilimitado',
    '"Pergunte ao Edital"',
    'Compliance Checker',
    'Até 5 usuários',
  ],
  enterprise: [
    'Tudo do Profissional +',
    'Licitagram Prospector (Outbound B2B)',
    'Guardian Compliance (Certidões automáticas)',
    'Robô de Lances com IA estratégica',
    'Sugestão de lance e Detecção de Anomalias',
    'Grafo Societário (67M+ CNPJs)',
    'Multi-CNPJ e API de integração',
    'Usuários ilimitados',
    'Onboarding Premium e Suporte dedicado',
  ],
}

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  starter: 'Essencial',
  essencial: 'Essencial',
  professional: 'Profissional',
  profissional: 'Profissional',
  enterprise: 'Enterprise',
}

const PLAN_BADGES: Record<string, string> = {
  professional: 'Mais popular',
  profissional: 'Mais popular',
  enterprise: 'Completo',
}

const FEATURE_LABELS: Record<string, { label: string; minPlan: string }> = {
  competitive_intel: { label: 'Espionagem Competitiva', minPlan: 'Profissional' },
  proposal_generator: { label: 'Fábrica de Propostas / Engenharia de Custos', minPlan: 'Profissional' },
  compliance_checker: { label: 'Blindagem de Compliance', minPlan: 'Essencial' },
  pregao_chat_monitor: { label: 'Monitor de Pregão', minPlan: 'Profissional' },
  bidding_bot: { label: 'Robô de Lances (Agente IA)', minPlan: 'Enterprise' },
  bidding_bot_supreme: { label: 'Chaves de API do Robô', minPlan: 'Profissional' },
  lead_engine: { label: 'Prospector de Leads B2B', minPlan: 'Enterprise' },
  multi_cnpj: { label: 'Multi-CNPJ (várias empresas)', minPlan: 'Enterprise' },
  certidoes_bot: { label: 'Guardian (certidões automáticas)', minPlan: 'Enterprise' },
  api_integration: { label: 'API de Integração', minPlan: 'Enterprise' },
  intelligence_center: { label: 'Central de Inteligência', minPlan: 'Enterprise' },
  graph_societario: { label: 'Grafo Societário (67M CNPJs)', minPlan: 'Enterprise' },
  radar_map: { label: 'Radar Geográfico', minPlan: 'Profissional' },
  whatsapp_alerts: { label: 'Alertas WhatsApp', minPlan: 'Profissional' },
  export_excel: { label: 'Exportar Excel', minPlan: 'Profissional' },
}

function planFeaturesList(plan: Plan): string[] {
  const slug = plan.slug?.toLowerCase() || ''
  if (PLAN_FEATURES_STATIC[slug]) return PLAN_FEATURES_STATIC[slug]
  const features: string[] = []
  const f = (plan.features ?? {}) as PlanFeatures
  if (plan.max_matches_per_month === null) features.push('Matches ilimitados')
  else features.push(`Até ${plan.max_matches_per_month} matches/mês`)
  if (f.telegram_alerts) features.push('Telegram SmartAlerts')
  if (f.whatsapp_alerts) features.push('WhatsApp FastMatch')
  if (f.chat_ia) features.push('Chat IA com edital')
  if (f.compliance_checker) features.push('Compliance Checker')
  if (f.proposal_generator) features.push('Gerador de Propostas')
  if (f.competitive_intel) features.push('Inteligência Competitiva')
  if (f.priority_support) features.push('Suporte prioritário')
  return features
}

function getPlanDisplayName(plan: Plan): string {
  return PLAN_DISPLAY_NAMES[plan.slug?.toLowerCase() || ''] || plan.name
}

function getPlanBadge(plan: Plan): string | null {
  return PLAN_BADGES[plan.slug?.toLowerCase() || ''] || null
}

type InvoiceRow = {
  id: string
  date: string | null
  amount: number
  currency: string
  status: string
  hostedUrl: string | null
  pdfUrl: string | null
  number: string | null
}

async function loadInvoices(customerId: string | null): Promise<InvoiceRow[]> {
  if (!customerId) return []
  try {
    const stripe = getStripe()
    const list = await stripe.invoices.list({ customer: customerId, limit: 12 })
    return list.data
      .filter((i) => i.status === 'paid' || i.status === 'open')
      .map((i) => ({
        id: i.id ?? '',
        date: i.created ? new Date(i.created * 1000).toISOString() : null,
        amount: i.amount_paid || i.amount_due || 0,
        currency: (i.currency || 'brl').toUpperCase(),
        status: i.status || 'unknown',
        hostedUrl: i.hosted_invoice_url || null,
        pdfUrl: i.invoice_pdf || null,
        number: i.number || null,
      }))
  } catch (e) {
    console.error('[conta/assinatura] invoices fetch error:', (e as Error).message)
    return []
  }
}

export default async function AssinaturaPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string
    canceled?: string
    expired?: string
    upgrade?: string
    plan?: string
    billing?: string
    feature?: string
    from?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Assinatura</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta ainda não está vinculada a uma empresa. Contate o suporte.
        </p>
      </div>
    )
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select(`
      status,
      stripe_customer_id,
      stripe_subscription_id,
      current_period_end,
      cancel_at_period_end,
      cancel_requested_at,
      expires_at,
      plans:plan_id ( id, slug, name, price_cents, billing_interval, features, max_matches_per_month, max_users, max_alerts_per_day )
    `)
    .eq('company_id', profile.company_id)
    .maybeSingle()

  const plan = (sub?.plans as unknown as Plan | null) || null
  const status = sub?.status ?? null
  const isCancelling = !!sub?.cancel_at_period_end
  const periodEnd = sub?.current_period_end ?? sub?.expires_at ?? null

  const showPicker = !!(params.upgrade || params.expired || params.canceled || params.feature || !plan)

  const [invoices, plansAll, matchLimit] = await Promise.all([
    loadInvoices(sub?.stripe_customer_id ?? null),
    showPicker ? getActivePlans() : Promise.resolve([]),
    profile.company_id ? checkMatchLimit(profile.company_id) : Promise.resolve(null),
  ])

  const currentPlanSlug = plan?.slug || null

  const statusBadge = (() => {
    if (isCancelling) return { label: 'Cancelamento agendado', tone: 'amber' as const }
    if (status === 'active') return { label: 'Ativo', tone: 'emerald' as const }
    if (status === 'trialing') return { label: 'Trial', tone: 'blue' as const }
    if (status === 'past_due') return { label: 'Pagamento pendente', tone: 'amber' as const }
    if (status === 'canceled') return { label: 'Cancelado', tone: 'red' as const }
    return { label: status || 'Sem plano', tone: 'gray' as const }
  })()

  const toneClasses: Record<string, string> = {
    emerald: 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30',
    blue: 'bg-blue-900/20 text-blue-400 border-blue-900/30',
    amber: 'bg-amber-900/20 text-amber-400 border-amber-900/30',
    red: 'bg-red-900/20 text-red-400 border-red-900/30',
    gray: 'bg-secondary text-muted-foreground border-border',
  }

  const featureInfo = params.feature ? FEATURE_LABELS[params.feature] : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Assinatura</h1>
        <p className="text-sm text-muted-foreground">Plano, faturas e cancelamento.</p>
      </div>

      {/* Auto-checkout: ?plan=slug triggers Stripe Checkout */}
      <Suspense>
        <AutoCheckout plans={plansAll.map((p) => ({ id: p.id, slug: p.slug, name: p.name }))} />
      </Suspense>

      {params.success && (
        <div className="rounded-lg border border-emerald-900/30 bg-emerald-900/20 p-4 text-sm text-emerald-400">
          Assinatura realizada com sucesso! Seu plano já está ativo.
        </div>
      )}
      {params.canceled && (
        <div className="rounded-lg border border-amber-900/30 bg-amber-900/20 p-4 text-sm text-amber-400">
          Checkout cancelado. Escolha um plano quando estiver pronto.
        </div>
      )}
      {params.expired && (
        <div className="rounded-lg border border-red-900/30 bg-red-900/20 p-4 text-sm text-red-400">
          Sua assinatura expirou ou foi cancelada. Escolha um plano para continuar usando a plataforma.
        </div>
      )}
      {params.upgrade && (
        <div className="rounded-lg border border-blue-900/30 bg-blue-900/20 p-4 text-sm text-blue-400">
          {featureInfo ? (
            <>
              <p className="font-semibold">🔒 {featureInfo.label} está bloqueado no seu plano atual.</p>
              <p className="mt-1">
                Disponível a partir do plano <strong>{featureInfo.minPlan}</strong>. Escolha abaixo o plano ideal.
              </p>
            </>
          ) : (
            <>A funcionalidade que você tentou acessar requer um plano superior. Faça upgrade para desbloquear.</>
          )}
        </div>
      )}

      {isCancelling && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-900/10 p-4 text-amber-300">
          <p className="font-medium">
            Sua assinatura será cancelada em{' '}
            {periodEnd ? formatDate(periodEnd) : 'fim do ciclo atual'}.
          </p>
          <p className="text-sm text-amber-200/80 mt-1">
            Você continua com acesso completo até lá. Mudou de ideia?
          </p>
          <div className="mt-3">
            <ReactivateButton />
          </div>
        </div>
      )}

      {/* Current plan */}
      <Card>
        <CardHeader>
          <CardTitle>Plano atual</CardTitle>
        </CardHeader>
        <CardContent>
          {plan ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-lg font-bold uppercase tracking-wide">{plan.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatBRL(plan.price_cents)}/
                    {plan.billing_interval === 'year' ? 'ano' : 'mês'}
                  </p>
                  {periodEnd && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {isCancelling ? 'Acesso até: ' : 'Próxima renovação: '}
                      {formatDate(periodEnd)}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className={toneClasses[statusBadge.tone]}>
                  {statusBadge.label}
                </Badge>
              </div>

              {matchLimit && (
                <div className="bg-[#1a1c1f] rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-gray-300">Uso do mês</p>
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
              )}

              <div className="flex flex-wrap gap-2">
                <ChangePlanButton />
                <PortalButton disabled={!sub?.stripe_customer_id} />
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Recursos inclusos</p>
                <ul className="space-y-1.5">
                  {planFeaturesList(plan).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="text-emerald-500 shrink-0">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Você ainda não tem um plano ativo. Escolha um plano abaixo para começar.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade picker */}
      {showPicker && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Planos disponíveis</h2>
          {plansAll.length === 0 ? (
            <div className="rounded-lg border border-amber-900/30 bg-amber-900/20 p-4 text-sm text-amber-400">
              Erro ao carregar planos. Tente recarregar a página ou entre em contato com o suporte.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plansAll.map((p) => {
                const isCurrent = currentPlanSlug === p.slug
                const features = planFeaturesList(p)
                const displayName = getPlanDisplayName(p)
                const badge = getPlanBadge(p)

                return (
                  <Card
                    key={p.id}
                    className={`relative ${
                      isCurrent ? 'border-brand border-2' : badge ? 'border-brand/50 border' : ''
                    }`}
                  >
                    {badge && !isCurrent && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand text-white text-[10px] font-semibold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">
                        {badge}
                      </span>
                    )}
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        {displayName}
                        {isCurrent && (
                          <Badge className="bg-brand/10 text-brand border-brand/20" variant="outline">
                            Atual
                          </Badge>
                        )}
                      </CardTitle>
                      <p className="text-2xl font-bold">
                        {formatBRL(p.price_cents)}
                        <span className="text-sm font-normal text-gray-400">/mês</span>
                      </p>
                      {p.description && (
                        <p className="text-sm text-gray-400 mt-1">{p.description}</p>
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
                      {!isCurrent && <UpgradeButton planId={p.id} label={`Assinar ${displayName}`} />}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Invoices */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de cobranças</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma fatura ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-4 font-medium">Data</th>
                    <th className="py-2 pr-4 font-medium">Nº</th>
                    <th className="py-2 pr-4 font-medium">Valor</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Fatura</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-4">{inv.date ? formatDate(inv.date) : '—'}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{inv.number || '—'}</td>
                      <td className="py-2 pr-4 tabular-nums">{formatBRL(inv.amount)}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className={inv.status === 'paid' ? toneClasses.emerald : toneClasses.amber}>
                          {inv.status === 'paid' ? 'Paga' : inv.status === 'open' ? 'Em aberto' : inv.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        {inv.pdfUrl ? (
                          <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            PDF
                          </a>
                        ) : inv.hostedUrl ? (
                          <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            Abrir
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel link */}
      {plan && !isCancelling && status !== 'canceled' && (
        <div className="pt-2">
          <CancelTrigger periodEnd={periodEnd} />
        </div>
      )}
    </div>
  )
}
