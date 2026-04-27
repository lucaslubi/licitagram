import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatBRL, formatDate } from '@/lib/format'
import { getStripe } from '@/lib/stripe'
import {
  ChangePlanButton,
  PortalButton,
  ReactivateButton,
  CancelTrigger,
} from './actions-bar'
import type { Plan, PlanFeatures } from '@licitagram/shared'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Assinatura · Licitagram' }

const PLAN_FEATURES_STATIC: Record<string, string[]> = {
  essencial: [
    'Telegram SmartAlerts',
    '+200.000 licitações monitoradas/mês',
    'AI Matching com score 0-100',
    'Pipeline Kanban e Dashboards',
    'Gestão de Certidões',
    '1 usuário',
  ],
  starter: [
    'Telegram SmartAlerts',
    'AI Matching com score 0-100',
    'Pipeline Kanban',
    '1 usuário',
  ],
  profissional: [
    'WhatsApp FastMatch',
    'Licitagram GeoRadar',
    'AI Matching ilimitado',
    '"Pergunte ao Edital" (Chat IA)',
    'Compliance Checker',
    'Gerador de Propostas',
    'Até 5 usuários',
  ],
  professional: [
    'WhatsApp FastMatch',
    'AI Matching ilimitado',
    '"Pergunte ao Edital"',
    'Compliance Checker',
    'Até 5 usuários',
  ],
  enterprise: [
    'Licitagram Prospector',
    'Guardian Compliance',
    'Robô de Lances com IA',
    'Multi-CNPJ e API',
    'Usuários ilimitados',
    'Suporte dedicado',
  ],
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
        amount: i.amount_paid || i.amount_due || 0, // cents
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

export default async function AssinaturaPage() {
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

  const invoices = await loadInvoices(sub?.stripe_customer_id ?? null)

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Assinatura</h1>
        <p className="text-sm text-muted-foreground">Plano, faturas e cancelamento.</p>
      </div>

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
                Você ainda não tem um plano ativo.
              </p>
              <Button asChild>
                <Link href="/billing">Ver planos</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
