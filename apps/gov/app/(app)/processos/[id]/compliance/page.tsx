import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ScanSearch,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getProcessoDetail, listRiscos } from '@/lib/processos/queries'
import { listEstimativas } from '@/lib/precos/actions'
import { summarizeCompliance, type ComplianceCheck } from '@/lib/compliance/engine'
import { AvancarComplianceButton } from './avancar-button'
import { PlanoAcaoIA } from './plano-acao-ia'

export const metadata: Metadata = { title: 'Compliance' }

export default async function CompliancePage({ params }: { params: { id: string } }) {
  const processo = await getProcessoDetail(params.id)
  if (!processo) notFound()
  const [riscos, estimativas] = await Promise.all([listRiscos(params.id), listEstimativas(params.id)])
  const summary = summarizeCompliance({ processo, riscos, estimativas })

  const pendentesSeveras = summary.checks.filter(
    (c) => !c.passed && (c.severity === 'critica' || c.severity === 'alta'),
  )

  return (
    <div className="mx-auto max-w-5xl space-y-10 animate-ink-in">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/processos/${params.id}`}>
            <ArrowLeft className="h-4 w-4" /> Processo
          </Link>
        </Button>
      </div>

      {/* Header memorando */}
      <header className="rule-top space-y-2 pt-6">
        <p className="label-institutional font-mono">
          {processo.numeroInterno ?? 'a atribuir'} · {processo.objeto.slice(0, 70)}
          {processo.objeto.length > 70 ? '…' : ''}
        </p>
        <h1 className="flex items-center gap-3 font-display text-[2rem] leading-[1.12] tracking-tight">
          <ScanSearch className="h-7 w-7 text-accent" />
          Compliance
        </h1>
        <p className="text-sm text-muted-foreground">
          Regras determinísticas da Lei 14.133/2021 e jurisprudência TCU. Bloqueia publicação se houver pendência
          crítica.
        </p>
      </header>

      {/* KPIs editoriais */}
      <section className="grid gap-0 border-y border-border sm:grid-cols-4">
        <KpiTile label="Total" value={summary.total.toString()} />
        <KpiTile label="Conformes" value={summary.passed.toString()} tone="ok" borderLeft />
        <KpiTile
          label="Críticas"
          value={summary.criticas.toString()}
          tone={summary.criticas > 0 ? 'destructive' : 'neutral'}
          borderLeft
        />
        <KpiTile
          label="Altas"
          value={summary.altas.toString()}
          tone={summary.altas > 0 ? 'warn' : 'neutral'}
          borderLeft
        />
      </section>

      {/* Status gate */}
      <Card
        className={
          summary.canPublish
            ? 'border-success/30 bg-success/5'
            : 'border-destructive/30 bg-destructive/5'
        }
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg tracking-tight">
            {summary.canPublish ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-success" />
                Pronto para elaboração do Edital
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                Bloqueado — pendências críticas
              </>
            )}
          </CardTitle>
          <CardDescription>
            {summary.canPublish
              ? 'Sem pendências críticas. Resolva os alertas altos antes da publicação.'
              : `${summary.criticas} pendência(s) crítica(s) precisam ser resolvidas.`}
          </CardDescription>
        </CardHeader>
        {summary.canPublish && processo.faseAtual === 'compliance' && (
          <CardContent>
            <AvancarComplianceButton processoId={params.id} />
          </CardContent>
        )}
      </Card>

      {/* Plano de Ação IA — só aparece quando há pendências severas */}
      {pendentesSeveras.length > 0 && (
        <PlanoAcaoIA processoId={params.id} pendentesCount={pendentesSeveras.length} />
      )}

      {/* Checklist */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="label-institutional">Verificações determinísticas</p>
            <h2 className="font-display text-xl tracking-tight">Checklist</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {summary.passed}/{summary.total} conformes
          </span>
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {summary.checks.map((c) => (
            <li key={c.id} className="flex gap-3 p-4">
              <CheckIcon check={c} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{c.label}</p>
                  {!c.passed && <SeverityBadge severity={c.severity} />}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.detail}</p>
                {c.citation && (
                  <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-accent">
                    {c.citation.lei}
                    {c.citation.artigo ? `, art. ${c.citation.artigo}` : ''}
                    {c.citation.paragrafo ? ` § ${c.citation.paragrafo}` : ''}
                    {c.citation.inciso ? `, inciso ${c.citation.inciso}` : ''}
                    {c.citation.acordao ? ` · ${c.citation.acordao}` : ''}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function KpiTile({
  label,
  value,
  tone = 'neutral',
  borderLeft,
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'destructive' | 'neutral'
  borderLeft?: boolean
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-success'
      : tone === 'warn'
        ? 'text-warning'
        : tone === 'destructive'
          ? 'text-destructive'
          : 'text-foreground'
  return (
    <div className={`px-6 py-5 ${borderLeft ? 'sm:border-l sm:border-border' : ''}`}>
      <p className="label-institutional">{label}</p>
      <p className={`mt-3 font-display text-[2.2rem] font-medium leading-none tracking-tight tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  )
}

function CheckIcon({ check }: { check: ComplianceCheck }) {
  if (check.passed) {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
  }
  if (check.severity === 'critica') {
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
  }
  return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
}

function SeverityBadge({ severity }: { severity: ComplianceCheck['severity'] }) {
  const style: Record<ComplianceCheck['severity'], string> = {
    critica: 'border-destructive/40 bg-destructive/10 text-destructive',
    alta: 'border-warning/40 bg-warning/10 text-warning',
    media: 'border-warning/30 bg-warning/5 text-warning',
    baixa: 'border-border text-muted-foreground',
    info: 'border-accent/30 bg-accent/5 text-accent',
  }
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${style[severity]}`}>
      {severity}
    </Badge>
  )
}
