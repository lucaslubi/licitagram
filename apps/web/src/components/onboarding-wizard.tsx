'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatPhoneBR } from '@/lib/format'
import {
  X,
  ChevronRight,
  ChevronDown,
  Check,
  MessageCircle,
  Send,
  PartyPopper,
  Sparkles,
  Search,
  Bell,
  Copy,
  ExternalLink,
} from 'lucide-react'

interface OnboardingWizardProps {
  userUfs?: string[]
  userKeywords?: string[]
  userEmail?: string
  hasTelegram: boolean
  hasWhatsapp: boolean
  onComplete: (startTour: boolean) => void
}

// --- Inline WhatsApp connect flow ---
type WaStatus = 'idle' | 'sending' | 'code_sent' | 'verifying' | 'connected'


const ALL_UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR',
  'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]

const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá',
  BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco',
  PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina',
  SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
}

export function OnboardingWizard({
  userUfs = [],
  userKeywords = [],
  userEmail = '',
  hasTelegram,
  hasWhatsapp,
  onComplete,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(1)
  const [keywords, setKeywords] = useState<string[]>(userKeywords)
  const [keywordInput, setKeywordInput] = useState('')
  const [selectedUfs, setSelectedUfs] = useState<string[]>(userUfs)
  const [saving, setSaving] = useState(false)

  // --- WhatsApp inline state ---
  const [waStatus, setWaStatus] = useState<WaStatus>(hasWhatsapp ? 'connected' : 'idle')
  const [waPhone, setWaPhone] = useState('')
  const [waCode, setWaCode] = useState('')
  const [waError, setWaError] = useState('')
  const [waExpanded, setWaExpanded] = useState(false)
  const [waConnected, setWaConnected] = useState(hasWhatsapp)

  // --- Telegram inline state ---
  const [tgExpanded, setTgExpanded] = useState(false)
  const [tgConnected, setTgConnected] = useState(hasTelegram)
  const [tgCopied, setTgCopied] = useState(false)

  // Check WhatsApp status on mount
  useEffect(() => {
    if (hasWhatsapp) return
    fetch('/api/whatsapp/status')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.connected) {
          setWaStatus('connected')
          setWaConnected(true)
        }
      })
      .catch(() => {})
  }, [hasWhatsapp])

  const sendWaCode = async () => {
    setWaError('')
    const digits = waPhone.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 11) {
      setWaError('Informe um número de celular válido')
      return
    }
    setWaStatus('sending')
    try {
      const res = await fetch('/api/whatsapp/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      })
      const data = await res.json()
      if (!res.ok) {
        setWaError(data.error || 'Erro ao enviar código')
        setWaStatus('idle')
        return
      }
      setWaStatus('code_sent')
    } catch {
      setWaError('Erro de conexão')
      setWaStatus('idle')
    }
  }

  const verifyWaCode = async () => {
    setWaError('')
    if (waCode.length !== 6) {
      setWaError('Digite o código de 6 dígitos')
      return
    }
    setWaStatus('verifying')
    try {
      const res = await fetch('/api/whatsapp/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: waCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setWaError(data.error || 'Erro ao verificar')
        setWaStatus('code_sent')
        return
      }
      setWaStatus('connected')
      setWaConnected(true)
      setWaExpanded(false)
    } catch {
      setWaError('Erro de conexão')
      setWaStatus('code_sent')
    }
  }

  const copyTelegramCommand = () => {
    navigator.clipboard.writeText(`/start ${userEmail}`)
    setTgCopied(true)
    setTimeout(() => setTgCopied(false), 2000)
  }

  const addKeyword = useCallback(() => {
    const trimmed = keywordInput.trim().toLowerCase()
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords((prev) => [...prev, trimmed])
    }
    setKeywordInput('')
  }, [keywordInput, keywords])

  const removeKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw))
  }

  const toggleUf = (uf: string) => {
    setSelectedUfs((prev) =>
      prev.includes(uf) ? prev.filter((u) => u !== uf) : [...prev, uf]
    )
  }

  const selectAllUfs = () => {
    setSelectedUfs(ALL_UFS)
  }

  const clearAllUfs = () => {
    setSelectedUfs([])
  }

  const handleSavePreferences = async () => {
    setSaving(true)
    try {
      await fetch('/api/settings/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, ufs: selectedUfs }),
      })
    } catch {
      // silently continue — user can adjust later in settings
    }
    setSaving(false)
    setStep(3)
  }

  const handleComplete = async (startTour: boolean) => {
    try {
      await fetch('/api/settings/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      })
    } catch {
      // continue anyway
    }
    onComplete(startTour)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-6 pb-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                s === step
                  ? 'w-8 bg-orange-500'
                  : s < step
                    ? 'w-2 bg-orange-300'
                    : 'w-2 bg-gray-200'
              }`}
            />
          ))}
        </div>

        <div className="p-8">
          {/* Step 1 — Welcome */}
          {step === 1 && (
            <div className="flex flex-col items-center text-center space-y-6 animate-in fade-in duration-300">
              <div className="w-48">
                <Image
                  src="/logo-preta.png"
                  alt="Licitagram"
                  width={440}
                  height={99}
                  className="w-full h-auto"
                />
              </div>

              <div className="space-y-3">
                <h1 className="text-2xl font-bold text-gray-900">
                  Bem-vindo ao Licitagram!
                </h1>
                <p className="text-gray-500 text-sm leading-relaxed max-w-sm">
                  Sua plataforma de inteligência para licitações públicas.
                  Encontre oportunidades, analise concorrentes e ganhe mais
                  licitações com IA.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Sparkles className="w-4 h-4 text-orange-400" />
                <span>Vamos configurar sua conta em 2 minutos</span>
              </div>

              <Button
                onClick={() => setStep(2)}
                size="lg"
                className="w-full max-w-xs"
              >
                Começar
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Step 2 — Keywords & UFs */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-orange-50 mb-2">
                  <Search className="w-5 h-5 text-orange-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  Configure suas preferências
                </h2>
                <p className="text-sm text-gray-500">
                  Defina o que buscar e onde buscar
                </p>
              </div>

              {/* Keywords input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Palavras-chave
                </label>
                <div className="flex gap-2">
                  <Input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addKeyword()
                      }
                    }}
                    placeholder="Ex: TI, software, mobiliário..."
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="default"
                    onClick={addKeyword}
                    disabled={!keywordInput.trim()}
                  >
                    Adicionar
                  </Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {keywords.map((kw) => (
                      <Badge
                        key={kw}
                        className="pl-2.5 pr-1 py-1 bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 cursor-default"
                      >
                        {kw}
                        <button
                          onClick={() => removeKeyword(kw)}
                          className="ml-1 p-0.5 rounded-full hover:bg-orange-200 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* UFs multi-select */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Estados de interesse
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllUfs}
                      className="text-xs text-orange-500 hover:text-orange-600 font-medium"
                    >
                      Todos
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={clearAllUfs}
                      className="text-xs text-gray-400 hover:text-gray-600 font-medium"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5 max-h-48 overflow-y-auto p-1">
                  {ALL_UFS.map((uf) => (
                    <button
                      key={uf}
                      onClick={() => toggleUf(uf)}
                      title={UF_NAMES[uf]}
                      className={`px-2 py-1.5 text-xs font-medium rounded-md border transition-all duration-150 ${
                        selectedUfs.includes(uf)
                          ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-600'
                      }`}
                    >
                      {uf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {(keywords.length > 0 || selectedUfs.length > 0) && (
                <div className="rounded-lg bg-orange-50 border border-orange-100 p-3 text-xs text-orange-700">
                  <strong>Prévia:</strong> Vamos buscar licitações
                  {keywords.length > 0 && (
                    <> com as palavras-chave <strong>{keywords.join(', ')}</strong></>
                  )}
                  {selectedUfs.length > 0 && (
                    <>
                      {' '}
                      {selectedUfs.length === 27
                        ? 'em todos os estados'
                        : `nos estados ${selectedUfs.join(', ')}`}
                    </>
                  )}
                  .
                </div>
              )}

              <Button
                onClick={handleSavePreferences}
                size="lg"
                className="w-full"
                disabled={saving}
              >
                {saving ? 'Salvando...' : 'Próximo'}
                {!saving && <ChevronRight className="w-4 h-4 ml-1" />}
              </Button>
            </div>
          )}

          {/* Step 3 — Notifications (inline connection flows) */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-orange-50 mb-2">
                  <Bell className="w-5 h-5 text-orange-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  Receba alertas em tempo real
                </h2>
                <p className="text-sm text-gray-500">
                  Conecte seus canais preferidos para não perder nenhuma
                  oportunidade
                </p>
              </div>

              <div className="space-y-3">
                {/* ── Telegram ── */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => !tgConnected && setTgExpanded((v) => !v)}
                    className="flex items-center justify-between w-full p-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                        <Send className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Telegram</p>
                        <p className="text-xs text-gray-500">Alertas instantâneos no Telegram</p>
                      </div>
                    </div>
                    {tgConnected ? (
                      <div className="flex items-center gap-1.5 text-emerald-600">
                        <Check className="w-4 h-4" />
                        <span className="text-xs font-medium">Conectado</span>
                      </div>
                    ) : (
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform ${tgExpanded ? 'rotate-180' : ''}`}
                      />
                    )}
                  </button>

                  {tgExpanded && !tgConnected && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-200 pt-3">
                      <ol className="text-sm text-gray-600 list-decimal list-inside space-y-2">
                        <li>
                          Abra o Telegram e busque por{' '}
                          <a
                            href="https://t.me/LicitagramBot"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 font-medium hover:underline inline-flex items-center gap-1"
                          >
                            @LicitagramBot
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </li>
                        <li>
                          Envie o comando:
                          <div className="flex items-center gap-2 mt-1.5">
                            <code className="bg-white border border-gray-200 px-3 py-1.5 rounded-md text-sm font-mono text-gray-800 flex-1 truncate">
                              /start {userEmail}
                            </code>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                copyTelegramCommand()
                              }}
                              className="shrink-0"
                            >
                              {tgCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </li>
                        <li>Pronto! Você receberá alertas automaticamente.</li>
                      </ol>
                      <p className="text-xs text-gray-400">
                        Após enviar o comando, a conexão será detectada automaticamente.
                      </p>
                    </div>
                  )}
                </div>

                {/* ── WhatsApp ── */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => !waConnected && setWaExpanded((v) => !v)}
                    className="flex items-center justify-between w-full p-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                        <MessageCircle className="w-5 h-5 text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">WhatsApp</p>
                        <p className="text-xs text-gray-500">Receba alertas no WhatsApp</p>
                      </div>
                    </div>
                    {waConnected ? (
                      <div className="flex items-center gap-1.5 text-emerald-600">
                        <Check className="w-4 h-4" />
                        <span className="text-xs font-medium">Conectado</span>
                      </div>
                    ) : (
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform ${waExpanded ? 'rotate-180' : ''}`}
                      />
                    )}
                  </button>

                  {waExpanded && !waConnected && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-200 pt-3">
                      {waStatus === 'idle' || waStatus === 'sending' ? (
                        <>
                          <div>
                            <Label htmlFor="onb-wa-phone" className="text-sm text-gray-700">
                              Número de celular
                            </Label>
                            <Input
                              id="onb-wa-phone"
                              type="tel"
                              placeholder="(11) 99999-9999"
                              value={waPhone}
                              onChange={(e) => setWaPhone(formatPhoneBR(e.target.value))}
                              className="mt-1 bg-white"
                            />
                          </div>
                          {waError && <p className="text-sm text-red-500">{waError}</p>}
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              sendWaCode()
                            }}
                            disabled={waStatus === 'sending'}
                            className="w-full"
                            size="sm"
                          >
                            {waStatus === 'sending' ? 'Enviando...' : 'Enviar Código de Verificação'}
                          </Button>
                        </>
                      ) : (waStatus === 'code_sent' || waStatus === 'verifying') ? (
                        <>
                          <p className="text-sm text-gray-600">
                            Enviamos um código de 6 dígitos para seu WhatsApp.
                          </p>
                          <div>
                            <Label htmlFor="onb-wa-code" className="text-sm text-gray-700">
                              Código de verificação
                            </Label>
                            <Input
                              id="onb-wa-code"
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              placeholder="000000"
                              value={waCode}
                              onChange={(e) => setWaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              className="text-center text-xl tracking-widest font-mono mt-1 bg-white"
                            />
                          </div>
                          {waError && <p className="text-sm text-red-500">{waError}</p>}
                          <div className="flex gap-2">
                            <Button
                              onClick={(e) => {
                                e.stopPropagation()
                                verifyWaCode()
                              }}
                              disabled={waStatus === 'verifying' || waCode.length !== 6}
                              className="flex-1"
                              size="sm"
                            >
                              {waStatus === 'verifying' ? 'Verificando...' : 'Verificar'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                setWaStatus('idle')
                                setWaCode('')
                                setWaError('')
                              }}
                            >
                              Voltar
                            </Button>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              sendWaCode()
                            }}
                            className="text-xs text-gray-400 underline hover:text-gray-600"
                          >
                            Reenviar código
                          </button>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-center text-gray-400">
                Você pode configurar isso depois em Configurações
              </p>

              <Button
                onClick={() => setStep(4)}
                size="lg"
                className="w-full"
              >
                Próximo
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Step 4 — Ready */}
          {step === 4 && (
            <div className="flex flex-col items-center text-center space-y-6 animate-in fade-in duration-300">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-50">
                <PartyPopper className="w-8 h-8 text-orange-500" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-gray-900">
                  Tudo pronto!
                </h2>
                <p className="text-sm text-gray-500">
                  Sua conta está configurada e pronta para usar.
                </p>
              </div>

              {/* Summary */}
              <div className="w-full rounded-xl bg-gray-50 border border-gray-200 p-4 text-left space-y-3">
                <div className="flex items-start gap-3">
                  <Search className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Palavras-chave
                    </p>
                    <p className="text-xs text-gray-500">
                      {keywords.length > 0
                        ? keywords.join(', ')
                        : 'Nenhuma definida'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Estados</p>
                    <p className="text-xs text-gray-500">
                      {selectedUfs.length === 27
                        ? 'Todos os estados'
                        : selectedUfs.length > 0
                          ? selectedUfs.join(', ')
                          : 'Nenhum selecionado'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Bell className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Notificações
                    </p>
                    <p className="text-xs text-gray-500">
                      {tgConnected && waConnected
                        ? 'Telegram e WhatsApp conectados'
                        : tgConnected
                          ? 'Telegram conectado'
                          : waConnected
                            ? 'WhatsApp conectado'
                            : 'Nenhum canal conectado'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col w-full gap-2">
                <Button
                  onClick={() => handleComplete(true)}
                  size="lg"
                  className="w-full"
                >
                  Fazer tour guiado
                </Button>
                <Button
                  onClick={() => handleComplete(false)}
                  variant="outline"
                  size="lg"
                  className="w-full"
                >
                  Ir para o painel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
