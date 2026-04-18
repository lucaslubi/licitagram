'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Copy,
  Loader2,
  Mail,
  ShieldAlert,
  Users as UsersIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCampanhaAction, type SetorLink } from '@/lib/pca/actions'

interface SetorOption {
  id: string
  nome: string
  sigla: string | null
  hasResponsavel: boolean
}

type Step = 0 | 1 | 2

interface Props {
  setores: SetorOption[]
}

function defaultPrazo(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  d.setHours(18, 0, 0, 0)
  return d
}

function formatDatetimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function NewCampanhaWizard({ setores }: Props) {
  const nextYear = new Date().getFullYear() + 1
  const [step, setStep] = useState<Step>(0)
  const [ano, setAno] = useState(nextYear)
  const [titulo, setTitulo] = useState(`PCA ${nextYear}`)
  const [prazoStr, setPrazoStr] = useState<string>(() => formatDatetimeLocal(defaultPrazo()))
  const [selected, setSelected] = useState<Set<string>>(new Set(setores.map((s) => s.id)))
  const [pending, startTransition] = useTransition()
  const [successLinks, setSuccessLinks] = useState<{ campanhaId: string; links: SetorLink[] } | null>(null)
  const router = useRouter()

  const prazoDate = useMemo(() => new Date(prazoStr), [prazoStr])
  const setoresSelecionados = useMemo(() => setores.filter((s) => selected.has(s.id)), [setores, selected])
  const setoresSemResponsavel = setoresSelecionados.filter((s) => !s.hasResponsavel)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const submit = () => {
    startTransition(async () => {
      const res = await createCampanhaAction({
        ano,
        titulo,
        prazoResposta: prazoDate,
        setorIds: Array.from(selected),
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Campanha criada. Convites disparados.')
      // Não redireciona automaticamente — mostra card com links pro admin copiar.
      setSuccessLinks({ campanhaId: res.campanhaId, links: res.links })
    })
  }

  if (successLinks) {
    return (
      <SuccessLinks
        campanhaId={successLinks.campanhaId}
        links={successLinks.links}
        onDone={() => {
          router.push(`/pca/${successLinks.campanhaId}`)
          router.refresh()
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Ano, título e prazo
            </CardTitle>
            <CardDescription>
              Recomendado: cabeça-de-exercício (ex: PCA 2027) com 2 semanas de prazo pra resposta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="ano">Ano</Label>
                <Input
                  id="ano"
                  type="number"
                  min={2024}
                  max={2099}
                  value={ano}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setAno(v)
                    if (titulo.startsWith('PCA ')) setTitulo(`PCA ${v}`)
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="titulo">Título</Label>
                <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prazo">Prazo de resposta</Label>
              <Input
                id="prazo"
                type="datetime-local"
                value={prazoStr}
                onChange={(e) => setPrazoStr(e.target.value)}
                min={formatDatetimeLocal(new Date(Date.now() + 24 * 3600 * 1000))}
              />
              <p className="text-xs text-muted-foreground">
                Setores que não responderem até essa data recebem lembrete automático e depois ficam marcados como pendentes na consolidação.
              </p>
            </div>
            <Footer forward={() => setStep(1)} forwardDisabled={!titulo || titulo.length < 3 || isNaN(prazoDate.getTime()) || prazoDate.getTime() <= Date.now()} />
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5 text-primary" />
              Setores que vão responder
            </CardTitle>
            <CardDescription>
              {selected.size === 0
                ? 'Selecione ao menos 1 setor.'
                : `${selected.size} de ${setores.length} setores selecionados.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 text-xs">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(setores.map((s) => s.id)))}>
                Selecionar todos
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Limpar
              </Button>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {setores.map((s) => {
                const active = selected.has(s.id)
                return (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 p-3 hover:bg-secondary/50">
                      <Checkbox checked={active} onCheckedChange={() => toggle(s.id)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {s.nome}
                          {s.sigla ? <span className="ml-2 text-xs text-muted-foreground">({s.sigla})</span> : null}
                        </p>
                        {!s.hasResponsavel && (
                          <p className="text-xs text-warning">Sem responsável cadastrado — não receberá email automático.</p>
                        )}
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
            {setoresSemResponsavel.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                {setoresSemResponsavel.length} setor(es) sem responsável — eles aparecem no painel com o link pra você copiar manualmente.
              </div>
            )}
            <Footer back={() => setStep(0)} forward={() => setStep(2)} forwardDisabled={selected.size === 0} />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              Confirma e envia
            </CardTitle>
            <CardDescription>Vou criar a campanha, gerar tokens únicos por setor e disparar os emails.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="divide-y divide-border rounded-lg border border-border text-sm">
              <SummaryRow label="Título" value={titulo} />
              <SummaryRow label="Ano" value={ano.toString()} />
              <SummaryRow
                label="Prazo"
                value={prazoDate.toLocaleString('pt-BR', {
                  day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              />
              <SummaryRow label="Setores" value={`${selected.size}`} />
              <SummaryRow
                label="Com email automático"
                value={`${setoresSelecionados.filter((s) => s.hasResponsavel).length}`}
              />
            </dl>
            <Footer
              back={() => setStep(1)}
              forward={submit}
              forwardLabel={pending ? 'Enviando...' : 'Criar e enviar convites'}
              forwardDisabled={pending}
              spinning={pending}
              forwardIcon={pending ? Loader2 : CheckCircle2}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 p-3">
      <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex-1 font-medium text-foreground">{value}</dd>
    </div>
  )
}

function Stepper({ step }: { step: Step }) {
  const labels = ['Prazo', 'Setores', 'Confirmar']
  return (
    <ol className="flex items-center gap-3 text-xs">
      {labels.map((label, i) => {
        const active = i === step
        const done = i < step
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                done
                  ? 'border-accent bg-accent text-accent-foreground'
                  : active
                    ? 'border-primary text-primary'
                    : 'border-border text-muted-foreground'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={active ? 'font-medium text-foreground' : 'text-muted-foreground'}>{label}</span>
            {i < labels.length - 1 && <span className="ml-1 h-px flex-1 bg-border" />}
          </li>
        )
      })}
    </ol>
  )
}

function Footer({
  back,
  forward,
  forwardLabel = 'Continuar',
  forwardIcon: ForwardIcon = ArrowRight,
  forwardDisabled,
  spinning = false,
}: {
  back?: () => void
  forward: () => void
  forwardLabel?: string
  forwardIcon?: typeof ArrowRight
  forwardDisabled?: boolean
  spinning?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      {back ? (
        <Button type="button" variant="ghost" onClick={back}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      ) : (
        <span />
      )}
      <Button type="button" onClick={forward} disabled={forwardDisabled}>
        <ForwardIcon className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
        {forwardLabel}
      </Button>
    </div>
  )
}

function SuccessLinks({
  campanhaId: _campanhaId,
  links,
  onDone,
}: {
  campanhaId: string
  links: SetorLink[]
  onDone: () => void
}) {
  const copy = async (url: string, setorNome: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(`Link do setor "${setorNome}" copiado`)
    } catch {
      toast.error('Não foi possível copiar — selecione e copie manualmente')
    }
  }

  const copyAll = async () => {
    const text = links.map((l) => `${l.setorNome}: ${l.url}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${links.length} links copiados`)
    } catch {
      toast.error('Não foi possível copiar em lote')
    }
  }

  const emailSent = links.filter((l) => l.emailEnviado).length
  const semResp = links.filter((l) => !l.hasResponsavel).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-accent">
          <CheckCircle2 className="h-5 w-5" />
          Campanha criada
        </CardTitle>
        <CardDescription>
          {emailSent > 0
            ? `${emailSent} de ${links.length} setores já receberam o link por email.`
            : 'Convites foram gerados.'}
          {semResp > 0 && ` ${semResp} setor(es) sem responsável — copie o link abaixo e envie manualmente.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          <ShieldAlert className="mr-1 inline h-3.5 w-3.5" /> Esses links aparecem <strong>uma única vez</strong>. Copie agora o que precisar.
        </div>

        <ul className="divide-y divide-border rounded-lg border border-border">
          {links.map((l) => (
            <li key={l.setorId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {l.setorNome}
                  {l.setorSigla && <span className="text-xs text-muted-foreground">({l.setorSigla})</span>}
                  {l.emailEnviado && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      <Mail className="h-3 w-3" /> enviado
                    </span>
                  )}
                </p>
                <code className="mt-1 block truncate font-mono text-[11px] text-muted-foreground" title={l.url}>
                  {l.url}
                </code>
              </div>
              <Button variant="outline" size="sm" onClick={() => copy(l.url, l.setorNome)}>
                <Copy className="h-3.5 w-3.5" /> Copiar
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={copyAll}>
            <Copy className="h-4 w-4" /> Copiar todos ({links.length})
          </Button>
          <Button onClick={onDone}>
            Ir pro painel da campanha <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
