'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  GanttChartSquare,
  Loader2,
  Search,
  Sparkles,
  Upload,
  User as UserIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { posthog, initAnalytics } from '@/lib/analytics'
import { lookupCnpjAction, completeOnboardingAction } from '@/lib/onboarding/actions'
import type { Objetivo, PerfilInput } from '@/lib/validations/onboarding'
import { isValidCnpj, normalizeCnpj } from '@/lib/cnpj/lookup'

type Step = 0 | 1 | 2 | 3
type OrgaoData = {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  esfera: 'federal' | 'estadual' | 'municipal' | 'distrital' | null
  poder: 'executivo' | 'legislativo' | 'judiciario' | 'autonomo' | null
  uf: string | null
  municipio: string | null
  codigoIbge: string | null
  naturezaJuridica: string | null
  isPublicOrgan: boolean
}

interface Props {
  initialNome: string
  email: string
}

const PAPEL_OPTIONS: { value: PerfilInput['papel']; label: string; hint: string }[] = [
  { value: 'admin', label: 'Administrador', hint: 'Configura órgão, equipe e plano' },
  { value: 'coordenador', label: 'Coordenador', hint: 'Aprova artefatos e publica' },
  { value: 'agente_contratacao', label: 'Agente de contratação', hint: 'Conduz a fase interna' },
  { value: 'requisitante', label: 'Requisitante', hint: 'Pede compras pelo setor' },
  { value: 'assessor_juridico', label: 'Assessor jurídico', hint: 'Emite parecer referencial' },
  { value: 'ordenador_despesa', label: 'Ordenador de despesa', hint: 'Autoriza despesas' },
]

const OBJETIVOS: { value: Objetivo; label: string; hint: string; icon: typeof Building2 }[] = [
  { value: 'pca_2027', label: 'Montar o PCA 2027', hint: 'Coletar demanda dos setores e publicar', icon: ClipboardList },
  { value: 'criar_etp', label: 'Criar um ETP / Processo', hint: 'Da DFD ao Edital, com IA + compliance TCU', icon: GanttChartSquare },
  { value: 'importar_processo', label: 'Importar processo do Compras.gov', hint: 'Continuar de onde parei', icon: Upload },
  { value: 'explorar', label: 'Só explorar', hint: 'Quero ver como o produto funciona', icon: Sparkles },
]

function formatCnpj(raw: string): string {
  const d = normalizeCnpj(raw).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export function OnboardingWizard({ initialNome, email }: Props) {
  const [step, setStep] = useState<Step>(0)
  const [cnpjInput, setCnpjInput] = useState('')
  const [orgao, setOrgao] = useState<OrgaoData | null>(null)
  const [perfil, setPerfil] = useState<PerfilInput>({ nomeCompleto: initialNome, cargo: null, papel: 'admin' })
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    initAnalytics()
    posthog.capture('onboarding_started', { email })
  }, [email])

  useEffect(() => {
    posthog.capture('onboarding_step_view', { step })
  }, [step])

  const lookup = () => {
    startTransition(async () => {
      const res = await lookupCnpjAction(cnpjInput)
      if (!res.ok) {
        toast.error(res.error)
        posthog.capture('onboarding_cnpj_lookup_failed', { error: res.error })
        return
      }
      setOrgao({
        cnpj: res.cnpj,
        razaoSocial: res.razaoSocial,
        nomeFantasia: res.nomeFantasia,
        esfera: res.esfera,
        poder: res.poder,
        uf: res.uf,
        municipio: res.municipio,
        codigoIbge: res.codigoIbge,
        naturezaJuridica: res.naturezaCodigo,
        isPublicOrgan: res.isPublicOrgan,
      })
      posthog.capture('onboarding_cnpj_lookup_ok', { isPublicOrgan: res.isPublicOrgan })
      setStep(1)
    })
  }

  const skipLookup = () => {
    if (!isValidCnpj(cnpjInput)) {
      toast.error('Informe um CNPJ válido antes de preencher manualmente.')
      return
    }
    setOrgao({
      cnpj: normalizeCnpj(cnpjInput),
      razaoSocial: '',
      nomeFantasia: null,
      esfera: null,
      poder: null,
      uf: null,
      municipio: null,
      codigoIbge: null,
      naturezaJuridica: null,
      isPublicOrgan: false,
    })
    posthog.capture('onboarding_cnpj_manual_entry')
    setStep(1)
  }

  const submit = () => {
    if (!orgao || !objetivo) return
    startTransition(async () => {
      posthog.capture('onboarding_submit', { objetivo, papel: perfil.papel })
      const res = await completeOnboardingAction({
        cnpj: orgao.cnpj,
        razaoSocial: orgao.razaoSocial,
        nomeFantasia: orgao.nomeFantasia ?? null,
        esfera: orgao.esfera ?? 'municipal',
        poder: orgao.poder ?? null,
        uf: orgao.uf ?? null,
        municipio: orgao.municipio ?? null,
        codigoIbge: orgao.codigoIbge ?? null,
        naturezaJuridica: orgao.naturezaJuridica ?? null,
        nomeCompleto: perfil.nomeCompleto,
        cargo: perfil.cargo ?? null,
        papel: perfil.papel,
        objetivo,
      })
      if (res && !res.ok) {
        toast.error(res.error)
        posthog.capture('onboarding_submit_failed', { error: res.error })
      }
      // Success: server action redirects to /dashboard, this code path stops here.
    })
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Qual é o CNPJ do seu órgão?
            </CardTitle>
            <CardDescription>
              Buscamos automaticamente razão social, esfera e localização na Receita Federal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                value={formatCnpj(cnpjInput)}
                onChange={(e) => setCnpjInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isValidCnpj(cnpjInput)) lookup()
                }}
                disabled={pending}
                autoFocus
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Use o CNPJ do órgão (executivo / legislativo / judiciário / autarquia). Pessoas físicas e empresas privadas não têm acesso ao Gov.
              </p>
            </div>
            <Button onClick={lookup} disabled={pending || !isValidCnpj(cnpjInput)} className="w-full">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {pending ? 'Consultando Receita...' : 'Consultar CNPJ'}
            </Button>
            <button
              type="button"
              onClick={skipLookup}
              disabled={pending || !isValidCnpj(cnpjInput)}
              className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Receita indisponível? Preencher manualmente
            </button>
          </CardContent>
        </Card>
      )}

      {step === 1 && orgao && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              Confirma os dados do órgão
            </CardTitle>
            <CardDescription>
              Encontramos os seguintes dados na Receita. Ajuste se necessário antes de continuar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!orgao.isPublicOrgan && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
                Esse CNPJ não foi reconhecido como órgão público pela Natureza Jurídica.
                Você pode continuar mesmo assim — escolha manualmente a esfera abaixo.
              </div>
            )}
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input value={formatCnpj(orgao.cnpj)} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="razao">Razão social</Label>
              <Input
                id="razao"
                value={orgao.razaoSocial}
                onChange={(e) => setOrgao({ ...orgao, razaoSocial: e.target.value })}
                disabled={pending}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="esfera">Esfera</Label>
                <select
                  id="esfera"
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={orgao.esfera ?? ''}
                  onChange={(e) =>
                    setOrgao({ ...orgao, esfera: (e.target.value || null) as OrgaoData['esfera'] })
                  }
                >
                  <option value="">— escolha —</option>
                  <option value="federal">Federal</option>
                  <option value="estadual">Estadual</option>
                  <option value="distrital">Distrital</option>
                  <option value="municipal">Municipal</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="uf">UF</Label>
                <Input
                  id="uf"
                  maxLength={2}
                  value={orgao.uf ?? ''}
                  onChange={(e) => setOrgao({ ...orgao, uf: e.target.value.toUpperCase() })}
                  disabled={pending}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="municipio">Município</Label>
              <Input
                id="municipio"
                value={orgao.municipio ?? ''}
                onChange={(e) => setOrgao({ ...orgao, municipio: e.target.value })}
                disabled={pending}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
              {orgao.poder && <Badge variant="secondary">Poder: {orgao.poder}</Badge>}
              {orgao.naturezaJuridica && <Badge variant="outline">Natureza: {orgao.naturezaJuridica}</Badge>}
              {orgao.codigoIbge && <Badge variant="outline">IBGE: {orgao.codigoIbge}</Badge>}
            </div>
            <Footer
              back={() => setStep(0)}
              forward={() => setStep(2)}
              forwardDisabled={!orgao.razaoSocial || !orgao.esfera}
            />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-primary" />
              Seu papel no órgão
            </CardTitle>
            <CardDescription>
              Define o que você pode aprovar e publicar. Pode ser ajustado depois nas configurações.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo</Label>
              <Input
                id="nome"
                value={perfil.nomeCompleto}
                onChange={(e) => setPerfil({ ...perfil, nomeCompleto: e.target.value })}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cargo">Cargo (opcional)</Label>
              <Input
                id="cargo"
                placeholder="Ex: Pregoeiro"
                value={perfil.cargo ?? ''}
                onChange={(e) => setPerfil({ ...perfil, cargo: e.target.value })}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <div className="grid gap-2">
                {PAPEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPerfil({ ...perfil, papel: opt.value })}
                    className={`flex items-start justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      perfil.papel === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-secondary/50'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.hint}</p>
                    </div>
                    {perfil.papel === opt.value && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
                  </button>
                ))}
              </div>
            </div>
            <Footer
              back={() => setStep(1)}
              forward={() => setStep(3)}
              forwardDisabled={!perfil.nomeCompleto || perfil.nomeCompleto.length < 2}
            />
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Por onde quer começar?
            </CardTitle>
            <CardDescription>
              Vamos te levar direto pra ação certa. Você pode mudar depois.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              {OBJETIVOS.map((opt) => {
                const Icon = opt.icon
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setObjetivo(opt.value)}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                      objetivo === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-secondary/50'
                    }`}
                  >
                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${objetivo === opt.value ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.hint}</p>
                    </div>
                    {objetivo === opt.value && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>
            <Footer
              back={() => setStep(2)}
              forwardLabel={pending ? 'Salvando...' : 'Concluir'}
              forwardIcon={pending ? Loader2 : CheckCircle2}
              forwardDisabled={!objetivo || pending}
              forward={submit}
              spinning={pending}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stepper({ step }: { step: Step }) {
  const labels = ['CNPJ', 'Órgão', 'Perfil', 'Objetivo']
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
