'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  X,
  ChevronRight,
  Check,
  MessageCircle,
  Send,
  PartyPopper,
  Sparkles,
  Search,
  Bell,
} from 'lucide-react'

interface OnboardingWizardProps {
  userUfs?: string[]
  userKeywords?: string[]
  hasTelegram: boolean
  hasWhatsapp: boolean
  onComplete: (startTour: boolean) => void
}

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
  hasTelegram,
  hasWhatsapp,
  onComplete,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(1)
  const [keywords, setKeywords] = useState<string[]>(userKeywords)
  const [keywordInput, setKeywordInput] = useState('')
  const [selectedUfs, setSelectedUfs] = useState<string[]>(userUfs)
  const [saving, setSaving] = useState(false)

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

          {/* Step 3 — Notifications */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in duration-300">
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
                {/* Telegram */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                      <Send className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Telegram
                      </p>
                      <p className="text-xs text-gray-500">
                        Alertas instantâneos no Telegram
                      </p>
                    </div>
                  </div>
                  {hasTelegram ? (
                    <div className="flex items-center gap-1.5 text-emerald-600">
                      <Check className="w-4 h-4" />
                      <span className="text-xs font-medium">Conectado</span>
                    </div>
                  ) : (
                    <a href="/settings">
                      <Button variant="outline" size="sm">
                        Conectar
                      </Button>
                    </a>
                  )}
                </div>

                {/* WhatsApp */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                      <MessageCircle className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        WhatsApp
                      </p>
                      <p className="text-xs text-gray-500">
                        Receba alertas no WhatsApp
                      </p>
                    </div>
                  </div>
                  {hasWhatsapp ? (
                    <div className="flex items-center gap-1.5 text-emerald-600">
                      <Check className="w-4 h-4" />
                      <span className="text-xs font-medium">Conectado</span>
                    </div>
                  ) : (
                    <a href="/settings">
                      <Button variant="outline" size="sm">
                        Conectar
                      </Button>
                    </a>
                  )}
                </div>
              </div>

              <p className="text-xs text-center text-gray-400">
                Você pode configurar isso depois em{' '}
                <a
                  href="/settings"
                  className="text-orange-500 hover:underline font-medium"
                >
                  Configurações
                </a>
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
                      {hasTelegram && hasWhatsapp
                        ? 'Telegram e WhatsApp conectados'
                        : hasTelegram
                          ? 'Telegram conectado'
                          : hasWhatsapp
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
