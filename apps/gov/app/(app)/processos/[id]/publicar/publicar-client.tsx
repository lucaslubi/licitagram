'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  confirmarPublicacaoManualAction,
  type PublicacaoRow,
} from '@/lib/pncp/actions'
import type { ComplianceSummary } from '@/lib/compliance/engine'

interface Props {
  processoId: string
  compliance: ComplianceSummary
  publicacoes: PublicacaoRow[]
  isTerminal: boolean
  numeroInterno: string | null
  objeto: string
}

/**
 * Fluxo semi-automático de publicação PNCP (2026-04-20).
 *
 * O sistema monta o pacote (PDFs + metadados) pronto pra upload manual
 * no portal PNCP. Não exige certificado ICP-Brasil — o upload oficial é
 * feito pelo próprio servidor no portal, com seu cert. O usuário cola o
 * numeroControlePNCP retornado e o sistema confirma a publicação.
 *
 * É o melhor UX possível enquanto a integração API + ICP-Brasil não
 * é implementada (exige infra de custódia de chaves + sandbox PNCP).
 */
export function PublicarClient({
  processoId,
  compliance,
  publicacoes,
  isTerminal,
  numeroInterno,
  objeto,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [numeroControle, setNumeroControle] = useState('')
  const router = useRouter()

  const ARTEFATOS_PDF: Array<{ tipo: string; label: string }> = [
    { tipo: 'dfd', label: 'DFD' },
    { tipo: 'etp', label: 'ETP' },
    { tipo: 'mapa_riscos', label: 'Mapa de Riscos' },
    { tipo: 'tr', label: 'Termo de Referência' },
    { tipo: 'edital', label: 'Minuta do Edital' },
    { tipo: 'parecer', label: 'Parecer Jurídico' },
  ]

  const confirmar = () => {
    if (!numeroControle.trim()) {
      toast.error('Cole o Nº de controle PNCP retornado pelo portal')
      return
    }
    if (
      !window.confirm(
        `Confirma a publicação do processo ${numeroInterno ?? ''} com o Nº de controle PNCP "${numeroControle.trim()}"?`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const res = await confirmarPublicacaoManualAction(processoId, numeroControle.trim())
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Publicação confirmada. Processo concluído.')
      router.refresh()
    })
  }

  const canPublish = compliance.canPublish

  return (
    <div className="space-y-6">
      {/* Compliance gate */}
      <Card
        className={
          canPublish
            ? 'border-success/30 bg-success/5'
            : 'border-destructive/30 bg-destructive/5'
        }
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg tracking-tight">
            {canPublish ? (
              <>
                <ShieldCheck className="h-5 w-5 text-success" /> Compliance aprovado
              </>
            ) : (
              <>
                <ShieldAlert className="h-5 w-5 text-destructive" /> Compliance bloqueia publicação
              </>
            )}
          </CardTitle>
          <CardDescription>
            {canPublish
              ? `${compliance.passed} de ${compliance.total} verificações conformes.`
              : `${compliance.criticas} crítica(s) · ${compliance.altas} alta(s). Resolva em /compliance antes de prosseguir.`}
          </CardDescription>
        </CardHeader>
      </Card>

      {isTerminal ? (
        /* Estado publicado — só histórico */
        <HistoricoSection publicacoes={publicacoes} />
      ) : (
        <>
          {/* Passo 1: Download do pacote */}
          <Card className={canPublish ? '' : 'opacity-60 pointer-events-none'}>
            <CardHeader className="border-b border-border">
              <div className="flex items-center gap-3">
                <StepNumber n="1" />
                <div className="flex-1">
                  <p className="label-institutional">Preparação</p>
                  <CardTitle className="font-display text-lg tracking-tight">
                    Baixar PDFs dos artefatos
                  </CardTitle>
                  <CardDescription>
                    PDFs institucionais (sem marca LicitaGram) com cabeçalho do órgão — prontos pra upload no
                    portal PNCP.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid gap-0 sm:grid-cols-2">
                {ARTEFATOS_PDF.map((a, i) => (
                  <a
                    key={a.tipo}
                    href={`/print/${processoId}/${a.tipo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 ${
                      i >= 2 ? 'sm:border-t sm:border-border' : ''
                    } ${i % 2 === 1 ? 'sm:border-l sm:border-border' : ''}`}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{a.label}</span>
                    <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </a>
                ))}
              </div>
              <div className="border-t border-border p-4 text-xs text-muted-foreground">
                <strong className="text-foreground">Atalho:</strong> cada PDF abre uma aba nova com o diálogo
                de impressão. Selecione &ldquo;Salvar como PDF&rdquo;. O filename já vem no padrão{' '}
                <code className="font-mono text-[10.5px]">
                  ETP - {objeto.slice(0, 30)}... - Proc {numeroInterno ?? 'nnn'}.pdf
                </code>
                .
              </div>
            </CardContent>
          </Card>

          {/* Passo 2: Upload no portal PNCP */}
          <Card className={canPublish ? '' : 'opacity-60 pointer-events-none'}>
            <CardHeader className="border-b border-border">
              <div className="flex items-center gap-3">
                <StepNumber n="2" />
                <div className="flex-1">
                  <p className="label-institutional">Portal PNCP</p>
                  <CardTitle className="font-display text-lg tracking-tight">
                    Publicar no portal oficial
                  </CardTitle>
                  <CardDescription>
                    Faça login no portal com seu certificado ICP-Brasil e envie os PDFs baixados no passo 1.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <ol className="space-y-3 text-sm">
                <li className="flex gap-2">
                  <span className="label-institutional shrink-0 pt-0.5">2.1</span>
                  <span className="text-muted-foreground">
                    Acesse{' '}
                    <a
                      href="https://www.gov.br/pncp/pt-br/acesso-a-informacao/area-do-orgao"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      pncp.gov.br → Área do Órgão
                      <ExternalLink className="ml-1 inline h-3 w-3" />
                    </a>{' '}
                    e autentique com certificado digital (A1 ou A3).
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="label-institutional shrink-0 pt-0.5">2.2</span>
                  <span className="text-muted-foreground">
                    Clique em <strong className="text-foreground">Publicações</strong> →{' '}
                    <strong className="text-foreground">Editais</strong> →{' '}
                    <strong className="text-foreground">Nova publicação</strong>.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="label-institutional shrink-0 pt-0.5">2.3</span>
                  <span className="text-muted-foreground">
                    Anexe os PDFs baixados no passo 1 nos campos correspondentes (edital, TR, anexos, parecer).
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="label-institutional shrink-0 pt-0.5">2.4</span>
                  <span className="text-muted-foreground">
                    Revise, assine digitalmente e submeta. O PNCP retornará um{' '}
                    <strong className="text-foreground">Nº de controle PNCP</strong> no formato{' '}
                    <code className="font-mono text-[11px]">
                      CNPJ-sequencial-numero/ano
                    </code>
                    .
                  </span>
                </li>
              </ol>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <a
                  href="https://www.gov.br/pncp/pt-br/acesso-a-informacao/area-do-orgao"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir portal PNCP
                </a>
              </Button>
            </CardContent>
          </Card>

          {/* Passo 3: Confirmar publicação */}
          <Card className={canPublish ? 'border-accent/30' : 'opacity-60 pointer-events-none'}>
            <CardHeader className="border-b border-border">
              <div className="flex items-center gap-3">
                <StepNumber n="3" accent />
                <div className="flex-1">
                  <p className="label-institutional">Finalização</p>
                  <CardTitle className="font-display text-lg tracking-tight">
                    Confirmar publicação
                  </CardTitle>
                  <CardDescription>
                    Cole o Nº de controle PNCP recebido no passo 2.4 pra o sistema marcar o processo como
                    publicado e arquivar o histórico.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-5">
              <div>
                <Label htmlFor="numero-controle">Nº de controle PNCP</Label>
                <Input
                  id="numero-controle"
                  value={numeroControle}
                  onChange={(e) => setNumeroControle(e.target.value)}
                  placeholder="00414607000118-1-000001/2026"
                  className="font-mono"
                />
              </div>
              <Button
                onClick={confirmar}
                disabled={pending || !numeroControle.trim() || !canPublish}
                variant="gradient"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {pending ? 'Confirmando…' : 'Confirmar publicação'}
              </Button>
            </CardContent>
          </Card>

          <HistoricoSection publicacoes={publicacoes} />

          {/* Disclaimer transparente sobre integração real */}
          <Card className="border-border/60 bg-muted/30">
            <CardContent className="flex items-start gap-3 py-4 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div className="space-y-1">
                <p>
                  <strong className="text-foreground">Sobre a integração PNCP.</strong> Atualmente o sistema
                  opera em modo semi-automático: prepara os PDFs institucionais e guia a submissão oficial no
                  portal do órgão, onde o servidor usa seu próprio certificado ICP-Brasil (MP 2.200-2/2001).
                </p>
                <p>
                  A integração direta por API com assinatura digital automatizada está no roadmap — exige
                  certificado A1/A3 do órgão custodiado com segurança e homologação no sandbox PNCP v2.3.
                  Quando ativada, os 3 passos acima viram <strong className="text-foreground">um clique</strong>.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function StepNumber({ n, accent }: { n: string; accent?: boolean }) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
        accent ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-background text-muted-foreground'
      }`}
    >
      <span className="font-display text-sm font-medium tabular-nums">{n}</span>
    </div>
  )
}

function HistoricoSection({ publicacoes }: { publicacoes: PublicacaoRow[] }) {
  if (publicacoes.length === 0) return null
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <p className="label-institutional">Auditoria</p>
        <CardTitle className="font-display text-lg tracking-tight">
          Histórico de publicações
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {publicacoes.map((p) => (
            <li key={p.id} className="flex items-start gap-3 p-4">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  p.status === 'publicado'
                    ? 'bg-success/10 text-success'
                    : p.status === 'falhou'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-warning/10 text-warning'
                }`}
              >
                {p.status === 'publicado' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : p.status === 'falhou' ? (
                  <ShieldAlert className="h-4 w-4" />
                ) : (
                  <Clock className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {p.tipoDocumento}
                  <Badge variant="outline" className="text-[10px]">
                    {p.status}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.numeroControle && (
                    <span className="font-mono">{p.numeroControle} · </span>
                  )}
                  {p.publicadoEm
                    ? `Publicado em ${new Date(p.publicadoEm).toLocaleString('pt-BR')}`
                    : `Registrado em ${new Date(p.criadoEm).toLocaleString('pt-BR')}`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
