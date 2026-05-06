import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { LeadsTable } from './leads-table'

export const dynamic = 'force-dynamic'

type Lead = {
  id: string
  email: string
  clientes_atuais: number | null
  ticket_medio: number | null
  horas_por_cliente: number | null
  automation_rate: number | null
  projection: { adicionalAno?: number; novosClientes?: number; roi?: string | number } | null
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected'
  notes: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<Lead['status'], string> = {
  new: 'Novo',
  contacted: 'Contatado',
  qualified: 'Qualificado',
  converted: 'Convertido',
  rejected: 'Recusado',
}

export default async function ConsultanciasLeadsPage() {
  await requirePlatformAdmin()

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: leads, error } = await supabase
    .from('consultancy_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error && error.code !== '42P01') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">
          Leads · Consultorias
        </h1>
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Erro ao carregar leads: {error.message}
        </div>
      </div>
    )
  }

  // Migration ainda não rodou em prod
  const tableMissing = error?.code === '42P01'
  const rows = (leads || []) as Lead[]

  // Stats por status
  const byStatus = rows.reduce<Record<string, number>>(
    (acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1
      return acc
    },
    { new: 0, contacted: 0, qualified: 0, converted: 0, rejected: 0 },
  )

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground tracking-tight sm:text-2xl">
          Leads · Consultorias
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Capturados via{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            /calculadora-consultoria
          </code>
          . Worker envia email Resend automático em até 5 min após captura.
        </p>
      </div>

      {tableMissing && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          A tabela <code className="font-mono text-xs">consultancy_leads</code> ainda não foi
          criada. Aplique a migration{' '}
          <code className="font-mono text-xs">20260503140000_consultancy_leads.sql</code> no
          Supabase pra ver os leads aqui.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(Object.keys(STATUS_LABELS) as Lead['status'][]).map((s) => (
          <div
            key={s}
            className="rounded-xl border border-border bg-card p-4"
          >
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {STATUS_LABELS[s]}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {byStatus[s] || 0}
            </p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      {rows.length === 0 && !tableMissing ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum lead capturado ainda. Quando alguém preencher a calculadora aparece aqui.
          </p>
        </div>
      ) : (
        <LeadsTable initialLeads={rows} />
      )}
    </div>
  )
}
