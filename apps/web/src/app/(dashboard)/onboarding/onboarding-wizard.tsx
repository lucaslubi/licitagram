'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { lookupCNPJ, saveCompany } from '@/actions/company'

type Step = 'empresa' | 'atividade' | 'contato' | 'pronto'

interface Props {
  initialCompany?: {
    id?: string
    cnpj?: string
    razao_social?: string
    uf?: string
    municipio?: string
    cnae_principal?: string
    palavras_chave?: string[]
    telefone?: string
    email?: string
    [key: string]: unknown
  } | null
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'empresa', label: 'Empresa' },
  { key: 'atividade', label: 'O que você vende' },
  { key: 'contato', label: 'WhatsApp' },
  { key: 'pronto', label: 'Pronto' },
]

export function OnboardingWizard({ initialCompany }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('empresa')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [loadingCnpj, setLoadingCnpj] = useState(false)

  const [form, setForm] = useState({
    id: initialCompany?.id ?? '',
    cnpj: initialCompany?.cnpj ?? '',
    razao_social: initialCompany?.razao_social ?? '',
    uf: initialCompany?.uf ?? '',
    municipio: initialCompany?.municipio ?? '',
    cnae_principal: initialCompany?.cnae_principal ?? '',
    palavras_chave: initialCompany?.palavras_chave ?? [],
    telefone: initialCompany?.telefone ?? '',
    email: initialCompany?.email ?? '',
  })
  const [keywordDraft, setKeywordDraft] = useState('')

  async function handleCnpjLookup() {
    const cnpj = form.cnpj.replace(/\D/g, '')
    if (cnpj.length !== 14) {
      setError('CNPJ deve ter 14 dígitos')
      return
    }
    setError(null)
    setLoadingCnpj(true)
    try {
      const result = await lookupCNPJ(cnpj)
      if ('data' in result && result.data) {
        const d = result.data
        setForm((p) => ({
          ...p,
          razao_social: d.nome || p.razao_social,
          uf: d.uf || p.uf,
          municipio: d.municipio || p.municipio,
          cnae_principal: d.atividade_principal || p.cnae_principal,
          telefone: d.telefone || p.telefone,
          email: d.email || p.email,
        }))
      } else {
        setError('Não conseguimos consultar esse CNPJ. Preencha manualmente.')
      }
    } finally {
      setLoadingCnpj(false)
    }
  }

  function addKeyword() {
    const k = keywordDraft.trim().toLowerCase()
    if (!k || k.length < 3) return
    if (form.palavras_chave.includes(k)) return
    setForm((p) => ({ ...p, palavras_chave: [...p.palavras_chave, k] }))
    setKeywordDraft('')
  }

  function removeKeyword(k: string) {
    setForm((p) => ({ ...p, palavras_chave: p.palavras_chave.filter((x) => x !== k) }))
  }

  function next() {
    setError(null)
    if (step === 'empresa') {
      if (!form.cnpj || !form.razao_social || !form.uf) {
        setError('CNPJ, razão social e UF são obrigatórios')
        return
      }
      setStep('atividade')
    } else if (step === 'atividade') {
      if (form.palavras_chave.length < 1) {
        setError('Adicione pelo menos 1 palavra-chave do que você vende')
        return
      }
      setStep('contato')
    } else if (step === 'contato') {
      finish()
    }
  }

  function finish() {
    setError(null)
    startTransition(async () => {
      const payload = {
        cnpj: form.cnpj.replace(/\D/g, ''),
        razao_social: form.razao_social,
        nome_fantasia: '',
        porte: '',
        uf: form.uf,
        municipio: form.municipio,
        cnae_principal: form.cnae_principal,
        cnaes_secundarios: [],
        descricao_servicos: '',
        capacidades: [],
        certificacoes: [],
        palavras_chave: form.palavras_chave,
        endereco: '',
        cep: '',
        telefone: form.telefone,
        email: form.email,
        banco: '',
        agencia: '',
        conta: '',
        representante_nome: '',
        representante_cpf: '',
        representante_cargo: '',
      }
      const result = await saveCompany(payload, form.id || undefined)
      if ('id' in result) {
        setStep('pronto')
      } else {
        setError(result.error || 'Erro ao salvar. Tente novamente.')
      }
    })
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step)

  return (
    <div className="max-w-xl mx-auto py-8">
      {/* Progress */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2 flex-1">
              <div
                className={`flex-1 h-1 rounded-full transition-colors ${
                  i <= stepIndex ? 'bg-brand' : 'bg-border'
                }`}
              />
            </div>
          ))}
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground font-mono tabular-nums">
          Passo {stepIndex + 1} / {STEPS.length} · {STEPS[stepIndex].label}
        </p>
      </div>

      {/* Step: empresa */}
      {step === 'empresa' && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
            Vamos começar pelo seu CNPJ
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Consultamos a Receita automaticamente. Nenhum dado é compartilhado.
          </p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="cnpj" className="text-xs text-muted-foreground">CNPJ</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="cnpj"
                  value={form.cnpj}
                  onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))}
                  placeholder="00.000.000/0000-00"
                  inputMode="numeric"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCnpjLookup}
                  disabled={loadingCnpj || form.cnpj.length < 14}
                >
                  {loadingCnpj ? 'Consultando…' : 'Consultar Receita'}
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="razao" className="text-xs text-muted-foreground">Razão social</Label>
              <Input
                id="razao"
                value={form.razao_social}
                onChange={(e) => setForm((p) => ({ ...p, razao_social: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="uf" className="text-xs text-muted-foreground">UF</Label>
                <Input
                  id="uf"
                  value={form.uf}
                  onChange={(e) => setForm((p) => ({ ...p, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="SP"
                  maxLength={2}
                  className="mt-1 uppercase"
                />
              </div>
              <div>
                <Label htmlFor="municipio" className="text-xs text-muted-foreground">Município</Label>
                <Input
                  id="municipio"
                  value={form.municipio}
                  onChange={(e) => setForm((p) => ({ ...p, municipio: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step: atividade */}
      {step === 'atividade' && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
            O que sua empresa vende?
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Adicione palavras-chave dos produtos ou serviços. O matching IA usa isso para
            achar pregões relevantes — e aprende com o tempo.
          </p>

          <div>
            <Label htmlFor="kw" className="text-xs text-muted-foreground">Palavras-chave</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="kw"
                value={keywordDraft}
                onChange={(e) => setKeywordDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addKeyword()
                  }
                }}
                placeholder="Ex: locação de gerador"
              />
              <Button type="button" onClick={addKeyword} disabled={keywordDraft.trim().length < 3}>
                Adicionar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Mínimo 1 palavra-chave. Mais palavras = mais oportunidades. Use termos que
              seus clientes usariam no edital.
            </p>
          </div>

          {form.palavras_chave.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {form.palavras_chave.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => removeKeyword(k)}
                  className="bg-muted text-foreground px-3 py-1.5 rounded-lg text-xs hover:bg-muted/60 transition-colors"
                >
                  {k} <span className="text-muted-foreground ml-1">×</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step: contato */}
      {step === 'contato' && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
            Onde mandamos os alertas?
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Pregões urgentes via WhatsApp. Você ativa outros canais depois (Telegram, e-mail).
            Opcional — pode deixar em branco e configurar no menu Configurações.
          </p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="phone" className="text-xs text-muted-foreground">WhatsApp (DDD + número)</Label>
              <Input
                id="phone"
                value={form.telefone}
                onChange={(e) => setForm((p) => ({ ...p, telefone: e.target.value }))}
                placeholder="(11) 99999-9999"
                inputMode="tel"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="email" className="text-xs text-muted-foreground">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="contato@empresa.com.br"
                className="mt-1"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step: pronto */}
      {step === 'pronto' && (
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-400 text-2xl mb-4">
            ✓
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
            Setup concluído
          </h1>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Nosso pipeline já está buscando pregões que batem com seu perfil. O primeiro alerta
            chega nas próximas horas — vamos priorizar os mais quentes.
          </p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => router.push('/dashboard')}>Ir para Command Center</Button>
            <Button variant="outline" onClick={() => router.push('/opportunities')}>Ver pregões ativos</Button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-5 bg-destructive/10 border border-destructive/30 rounded-xl p-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Footer nav */}
      {step !== 'pronto' && (
        <div className="mt-8 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const prev = STEPS[stepIndex - 1]
              if (prev) setStep(prev.key)
            }}
            disabled={stepIndex === 0}
          >
            ← Voltar
          </Button>
          <Button type="button" onClick={next} disabled={isPending}>
            {isPending ? 'Salvando…' : stepIndex === STEPS.length - 2 ? 'Concluir' : 'Próximo →'}
          </Button>
        </div>
      )}
    </div>
  )
}
