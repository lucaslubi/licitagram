import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, ClipboardCheck, Clock, History } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { listProcessos } from '@/lib/processos/queries'
import { FASE_LABEL, TIPO_LABEL, MODALIDADE_LABEL } from '@/lib/validations/processo'

export const metadata: Metadata = { title: 'Histórico' }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function HistoricoPage() {
  const processos = await listProcessos()

  const publicados = processos.filter((p) => p.faseAtual === 'publicado')
  const emAndamento = processos.filter((p) => !['publicado', 'cancelado'].includes(p.faseAtual))
  const cancelados = processos.filter((p) => p.faseAtual === 'cancelado')

  return (
    <div className="mx-auto max-w-5xl space-y-10 animate-ink-in">
      <header className="rule-top space-y-2 pt-6">
        <p className="label-institutional">Auditoria institucional</p>
        <h1 className="flex items-center gap-3 font-display text-[2rem] leading-[1.12] tracking-tight">
          <History className="h-7 w-7 text-accent" />
          Histórico
        </h1>
        <p className="text-sm text-muted-foreground">
          Todos os processos do órgão, ordenados por data de criação. Cada linha liga à pasta do processo com
          artefatos, compliance e publicação.
        </p>
      </header>

      {/* KPIs editoriais */}
      <section className="grid gap-0 border-y border-border sm:grid-cols-3">
        <KpiTile label="Publicados" value={publicados.length.toString()} tone="ok" />
        <KpiTile label="Em andamento" value={emAndamento.length.toString()} borderLeft />
        <KpiTile label="Total do exercício" value={processos.length.toString()} borderLeft accent />
      </section>

      {processos.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg tracking-tight">Sem processos registrados</CardTitle>
            <CardDescription>
              Quando a unidade abrir o primeiro processo administrativo, ele aparecerá aqui.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {publicados.length > 0 && (
            <section className="space-y-3">
              <h2 className="label-institutional">Publicados no PNCP</h2>
              <ul className="overflow-hidden rounded-md border border-border">
                {publicados.map((p, i) => (
                  <ProcessoRow key={p.id} p={p} index={i} tone="ok" />
                ))}
              </ul>
            </section>
          )}

          {emAndamento.length > 0 && (
            <section className="space-y-3">
              <h2 className="label-institutional">Em andamento</h2>
              <ul className="overflow-hidden rounded-md border border-border">
                {emAndamento.map((p, i) => (
                  <ProcessoRow key={p.id} p={p} index={i} />
                ))}
              </ul>
            </section>
          )}

          {cancelados.length > 0 && (
            <section className="space-y-3">
              <h2 className="label-institutional">Cancelados</h2>
              <ul className="overflow-hidden rounded-md border border-border opacity-70">
                {cancelados.map((p, i) => (
                  <ProcessoRow key={p.id} p={p} index={i} tone="muted" />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

interface ProcessoSummary {
  id: string
  numeroInterno: string | null
  objeto: string
  tipo: string
  modalidade: string | null
  faseAtual: string
  valorEstimado: number | null
  setorNome: string | null
  criadoEm: string
  artefatosCount: number
}

function ProcessoRow({
  p,
  index,
  tone = 'default',
}: {
  p: ProcessoSummary
  index: number
  tone?: 'ok' | 'muted' | 'default'
}) {
  return (
    <li className={index > 0 ? 'border-t border-border' : ''}>
      <Link
        href={`/processos/${p.id}`}
        className="group flex items-center gap-4 p-4 transition-colors hover:bg-muted/40"
      >
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
            tone === 'ok'
              ? 'border-success/30 bg-success/10 text-success'
              : tone === 'muted'
                ? 'border-border bg-muted text-muted-foreground'
                : 'border-accent/20 bg-accent/5 text-accent'
          }`}
        >
          {tone === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {p.numeroInterno ?? 'a atribuir'}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {TIPO_LABEL[p.tipo as keyof typeof TIPO_LABEL] ?? p.tipo}
            </Badge>
            {p.modalidade && (
              <Badge variant="outline" className="text-[10px]">
                {MODALIDADE_LABEL[p.modalidade as keyof typeof MODALIDADE_LABEL] ?? p.modalidade}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={`text-[10px] ${tone === 'ok' ? 'border-success/40 text-success' : 'border-accent/30 text-accent'}`}
            >
              {FASE_LABEL[p.faseAtual] ?? p.faseAtual}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-1 text-sm font-medium">{p.objeto}</p>
          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {p.setorNome && <span>{p.setorNome}</span>}
            {p.valorEstimado != null && (
              <span className="font-mono tabular-nums">R$ {p.valorEstimado.toLocaleString('pt-BR')}</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(p.criadoEm)}
            </span>
            <span>{p.artefatosCount} artefato(s)</span>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  )
}

function KpiTile({
  label,
  value,
  tone = 'neutral',
  accent,
  borderLeft,
}: {
  label: string
  value: string
  tone?: 'ok' | 'neutral'
  accent?: boolean
  borderLeft?: boolean
}) {
  const color =
    tone === 'ok' ? 'text-success' : accent ? 'text-accent' : 'text-foreground'
  return (
    <div className={`px-6 py-5 ${borderLeft ? 'sm:border-l sm:border-border' : ''}`}>
      <p className="label-institutional">{label}</p>
      <p className={`mt-3 font-display text-[2.2rem] font-medium leading-none tracking-tight tabular-nums ${color}`}>
        {value}
      </p>
    </div>
  )
}
