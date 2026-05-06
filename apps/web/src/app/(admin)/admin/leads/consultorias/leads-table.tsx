'use client'

import { useState, useTransition } from 'react'
import { updateConsultancyLeadStatus } from './actions'

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

const STATUS_OPTIONS: Array<Lead['status']> = [
  'new',
  'contacted',
  'qualified',
  'converted',
  'rejected',
]
const STATUS_LABELS: Record<Lead['status'], string> = {
  new: 'Novo',
  contacted: 'Contatado',
  qualified: 'Qualificado',
  converted: 'Convertido',
  rejected: 'Recusado',
}

function statusPillClasses(s: Lead['status']): string {
  switch (s) {
    case 'converted':
      return 'border-brand/40 bg-brand/15 text-brand'
    case 'qualified':
      return 'border-brand/30 bg-brand/10 text-brand'
    case 'contacted':
      return 'border-border bg-secondary text-foreground'
    case 'rejected':
      return 'border-destructive/30 bg-destructive/10 text-destructive'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

function fmtBRL(n: number | null | undefined): string {
  if (n == null) return '—'
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function fmtN(n: number | null | undefined): string {
  if (n == null) return '—'
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function LeadsTable({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState(initialLeads)
  const [pending, startTransition] = useTransition()
  const [filter, setFilter] = useState<Lead['status'] | 'all'>('all')

  function changeStatus(leadId: string, status: Lead['status']) {
    setLeads((curr) => curr.map((l) => (l.id === leadId ? { ...l, status } : l)))
    startTransition(async () => {
      const res = await updateConsultancyLeadStatus(leadId, status)
      if (!res.ok) {
        // rollback otimista
        setLeads(initialLeads)
        alert(`Erro: ${res.error}`)
      }
    })
  }

  const filtered = filter === 'all' ? leads : leads.filter((l) => l.status === filter)

  return (
    <div className="space-y-3">
      {/* Filtro */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            filter === 'all'
              ? 'border-brand/40 bg-brand/10 text-brand'
              : 'border-border bg-card text-muted-foreground hover:text-foreground'
          }`}
        >
          Todos ({leads.length})
        </button>
        {STATUS_OPTIONS.map((s) => {
          const n = leads.filter((l) => l.status === s).length
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                filter === s
                  ? 'border-brand/40 bg-brand/10 text-brand'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {STATUS_LABELS[s]} ({n})
            </button>
          )
        })}
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/50">
            <tr className="text-left">
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Quando</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Clientes</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Ticket</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Projeção/ano</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">ROI</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-border last:border-0 hover:bg-secondary/30"
              >
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {fmtDate(lead.created_at)}
                </td>
                <td className="px-4 py-3 text-foreground">
                  <a
                    href={`mailto:${lead.email}`}
                    className="hover:text-brand transition-colors"
                  >
                    {lead.email}
                  </a>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtN(lead.clientes_atuais)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {fmtBRL(lead.ticket_medio)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-brand">
                  {fmtBRL(lead.projection?.adicionalAno ?? null)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {lead.projection?.roi != null ? `${lead.projection.roi}x` : '—'}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={lead.status}
                    onChange={(e) => changeStatus(lead.id, e.target.value as Lead['status'])}
                    disabled={pending}
                    className={`rounded-full border px-3 py-1 text-xs font-medium font-mono uppercase tracking-wider cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand/50 ${statusPillClasses(lead.status)}`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Nenhum lead com este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
