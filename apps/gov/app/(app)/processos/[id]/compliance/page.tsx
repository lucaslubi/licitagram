import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, CheckCircle2, ScanSearch, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getProcessoDetail, listRiscos } from '@/lib/processos/queries'
import { listEstimativas } from '@/lib/precos/actions'
import { summarizeCompliance, type ComplianceCheck } from '@/lib/compliance/engine'
import { AvancarComplianceButton } from './avancar-button'

export const metadata: Metadata = { title: 'Compliance' }

export default async function CompliancePage({ params }: { params: { id: string } }) {
  const processo = await getProcessoDetail(params.id)
  if (!processo) notFound()
  const [riscos, estimativas] = await Promise.all([
    listRiscos(params.id),
    listEstimativas(params.id),
  ])
  const summary = summarizeCompliance({ processo, riscos, estimativas })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/processos/${params.id}`}>
            <ArrowLeft className="h-4 w-4" /> Processo
          </Link>
        </Button>
      </div>
      <header className="space-y-1.5">
        <p className="font-mono text-xs uppercase tracking-wide text-primary">
          {processo.numeroInterno ?? '—'} · {processo.objeto.slice(0, 80)}{processo.objeto.length > 80 ? '…' : ''}
        </p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <ScanSearch className="h-7 w-7 text-primary" /> Compliance Engine
        </h1>
        <p className="text-sm text-muted-foreground">
          Regras determinísticas (código puro, não LLM) da Lei 14.133/2021 e jurisprudência TCU. Bloqueia publicação se houver pendência crítica.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total" value={summary.total.toString()} />
        <Stat label="Conformes" value={summary.passed.toString()} tone="accent" />
        <Stat label="Críticas" value={summary.criticas.toString()} tone={summary.criticas > 0 ? 'destructive' : 'muted'} />
        <Stat label="Altas" value={summary.altas.toString()} tone={summary.altas > 0 ? 'warning' : 'muted'} />
      </section>

      <Card className={summary.canPublish ? 'border-accent/30 bg-accent/5' : 'border-destructive/30 bg-destructive/5'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {summary.canPublish ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-accent" />
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
              ? 'Sem pendências críticas. Recomendação: resolver alertas de severidade alta antes da publicação.'
              : `${summary.criticas} pendência(s) crítica(s) precisam ser resolvidas antes de avançar.`}
          </CardDescription>
        </CardHeader>
        {summary.canPublish && processo.faseAtual === 'compliance' && (
          <CardContent>
            <AvancarComplianceButton processoId={params.id} />
          </CardContent>
        )}
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Checklist</h2>
        <ul className="divide-y divide-border rounded-lg border border-border">
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
                  <p className="mt-1 font-mono text-[11px] text-primary">
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

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'accent' | 'destructive' | 'warning' | 'muted' }) {
  const toneClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'destructive'
        ? 'text-destructive'
        : tone === 'warning'
          ? 'text-warning'
          : tone === 'muted'
            ? 'text-muted-foreground'
            : ''
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs uppercase tracking-wide">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`font-mono text-3xl font-semibold ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function CheckIcon({ check }: { check: ComplianceCheck }) {
  if (check.passed) {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
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
    <Badge variant="outline" className={style[severity]}>
      {severity}
    </Badge>
  )
}
