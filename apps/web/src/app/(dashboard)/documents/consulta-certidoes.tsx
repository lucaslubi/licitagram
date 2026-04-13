'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { GuidedCertidao } from './guided-certidao'
import { saveToDrive } from '@/lib/drive-utils'
import { formatCNPJ as formatCnpj } from '@/lib/format'

interface CertidaoResultItem {
  tipo: string
  label: string
  situacao: 'regular' | 'irregular' | 'error' | 'pending' | 'manual'
  detalhes: string
  numero: string | null
  emissao: string | null
  validade: string | null
  pdf_url: string | null
  consulta_url: string | null
}

interface ConsultaResponse {
  success: boolean
  consultado_em: string
  razao_social: string | null
  certidoes: CertidaoResultItem[]
  saved: string[]
  errors: string[]
  error?: string
  jobId?: string | null
  jobStatus?: string
}

interface JobStatusResponse {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: Record<string, unknown>
  result: { certidoes: CertidaoResultItem[] } | null
  error: string | null
}

const SITUACAO_CONFIG: Record<string, { label: string; icon: string; border: string; bg: string; text: string; badge: string }> = {
  regular:   { label: 'Regular',         icon: '\u2705', border: 'border-emerald-900/30', bg: 'bg-emerald-900/20', text: 'text-gray-300', badge: 'text-emerald-400 bg-emerald-900/30' },
  irregular: { label: 'Irregular',       icon: '\u274C', border: 'border-red-900/30',     bg: 'bg-red-900/20',     text: 'text-gray-300', badge: 'text-red-400 bg-red-900/30' },
  error:     { label: 'Erro',            icon: '\u26A0\uFE0F', border: 'border-amber-900/30',  bg: 'bg-amber-900/20',  text: 'text-gray-300', badge: 'text-amber-400 bg-amber-900/30' },
  pending:   { label: 'Processando',     icon: '\u23F3', border: 'border-blue-900/30',    bg: 'bg-blue-900/20',    text: 'text-gray-300', badge: 'text-blue-400 bg-blue-900/30' },
  manual:    { label: 'Consulta Manual', icon: '\uD83D\uDD17', border: 'border-[#2d2f33]',     bg: 'bg-[#1a1c1f]',     text: 'text-gray-300', badge: 'text-gray-400 bg-[#2d2f33]' },
}

export function ConsultaCertidoes({ cnpj }: { cnpj: string; hasApiKey?: boolean }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ConsultaResponse | null>(null)
  const [asyncCertidoes, setAsyncCertidoes] = useState<CertidaoResultItem[]>([])
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guidedPortal, setGuidedPortal] = useState<'receita' | 'fgts' | null>(null)
  const [driveSaving, setDriveSaving] = useState<string | null>(null)
  const [driveSaved, setDriveSaved] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const router = useRouter()

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  const pollJobStatus = useCallback((jobId: string) => {
    setJobStatus('pending')

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/certidoes/status?jobId=${jobId}`)
        if (!res.ok) return

        const data: JobStatusResponse = await res.json()
        setJobStatus(data.status)

        if (data.status === 'completed' && data.result?.certidoes) {
          setAsyncCertidoes(data.result.certidoes)
          setJobStatus('completed')
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
          router.refresh()
        } else if (data.status === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      } catch {
        // Silent fail on poll
      }
    }, 3000)
  }, [router])

  async function handleSaveCertidaoDrive(cert: CertidaoResultItem) {
    if (!cert.pdf_url) return
    setDriveSaving(cert.tipo)
    try {
      const res = await fetch(cert.pdf_url)
      if (!res.ok) throw new Error('Falha ao baixar PDF')
      const blob = await res.blob()
      const fileName = `certidao-${cert.tipo}-${new Date().toISOString().split('T')[0]}.pdf`
      const result = await saveToDrive({
        file: blob,
        fileName,
        category: 'certidao',
        description: cert.label,
        tags: ['certidao', cert.tipo],
      })
      if (result.success) {
        setDriveSaved(cert.tipo)
        setTimeout(() => setDriveSaved(null), 3000)
      } else {
        alert(result.error || 'Erro ao salvar no Drive.')
      }
    } catch {
      alert('Erro ao salvar certidao no Drive.')
    }
    setDriveSaving(null)
  }

  async function handleConsultar() {
    setLoading(true)
    setError(null)
    setResult(null)
    setAsyncCertidoes([])
    setJobStatus(null)
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    try {
      const res = await fetch('/api/certidoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSolve: true }),
      })

      const data: ConsultaResponse = await res.json()

      if (!res.ok || data.error) {
        setError(data.error || 'Erro ao consultar certidoes')
        return
      }

      setResult(data)

      if (data.jobId) {
        pollJobStatus(data.jobId)
      }

      router.refresh()
    } catch {
      setError('Erro de conexao. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // Combine sync + async results
  const syncCertidoes = result?.certidoes || []
  const asyncMap = new Map(asyncCertidoes.map(c => [c.tipo, c]))
  const merged = syncCertidoes.map(c => asyncMap.get(c.tipo) || c)
  for (const c of asyncCertidoes) {
    if (!syncCertidoes.find(s => s.tipo === c.tipo)) {
      merged.push(c)
    }
  }
  const allCertidoes = merged
  const autoResults = allCertidoes.filter(c => c.situacao !== 'manual')
  const manualResults = allCertidoes.filter(c => c.situacao === 'manual')
  const isPolling = jobStatus === 'pending' || jobStatus === 'processing'

  return (
    <div className="space-y-4">
      {/* Header + Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-400">
            Verifica sanções automaticamente. Certidões com captcha são emitidas pelo servidor.
          </p>
        </div>
        <button
          onClick={handleConsultar}
          disabled={loading || isPolling}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-lg hover:bg-brand/90 disabled:opacity-60 text-sm font-medium shadow-sm transition-all whitespace-nowrap"
        >
          {loading || isPolling ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {isPolling ? 'Processando...' : 'Consultando...'}
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Verificar Habilitação
            </>
          )}
        </button>
      </div>

      {/* Loading / Polling */}
      {(loading || isPolling) && (
        <div className="rounded-lg border border-blue-900/30 bg-blue-900/20 p-4">
          <p className="text-sm text-blue-400 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {isPolling
              ? 'Emitindo certidões via servidor (captchas sendo resolvidos automaticamente)...'
              : `Consultando certidões para CNPJ ${formatCnpj(cnpj)}...`}
          </p>
          {isPolling && (
            <p className="text-sm text-blue-400/70 mt-1">
              Isso pode levar 1-2 minutos. Não feche esta página.
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-900/30 bg-red-900/20 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Consultado em {new Date(result.consultado_em).toLocaleString('pt-BR')}
              {result.razao_social && ` \u2014 ${result.razao_social}`}
            </p>
            <div className="flex items-center gap-3">
              {result.saved.length > 0 && (
                <span className="text-sm text-gray-300 font-medium">
                  {result.saved.length + asyncCertidoes.filter(c => c.situacao === 'regular' || c.situacao === 'irregular').length} certidao(oes) salva(s)
                </span>
              )}
              {autoResults.length > 0 && (
                <span className="text-sm text-brand font-medium bg-brand/10 px-2.5 py-0.5 rounded-full">
                  {autoResults.length} automatica(s)
                </span>
              )}
            </div>
          </div>

          {/* Automatic results */}
          {autoResults.map((cert) => {
            const config = SITUACAO_CONFIG[cert.situacao] || SITUACAO_CONFIG.pending
            return (
              <div key={cert.tipo} className={`rounded-lg border p-4 ${config.border} ${config.bg}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base text-white flex items-center gap-1.5">
                      <span>{config.icon}</span>
                      {cert.label}
                    </p>
                    <p className={`text-sm mt-1 ${config.text}`}>{cert.detalhes}</p>
                    {cert.numero && (
                      <p className="text-sm mt-1 font-mono text-gray-400">N\u00BA {cert.numero}</p>
                    )}
                    {cert.validade && (
                      <p className="text-sm mt-0.5 text-gray-400">
                        Validade: {new Date(cert.validade).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <span className={`text-sm font-bold shrink-0 px-2.5 py-1 rounded-full ${config.badge}`}>
                    {config.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  {cert.pdf_url && (
                    <a
                      href={cert.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-brand hover:text-brand/80 flex items-center gap-1"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Baixar PDF
                    </a>
                  )}
                  {cert.pdf_url && (
                    <button
                      onClick={() => handleSaveCertidaoDrive(cert)}
                      disabled={driveSaving === cert.tipo}
                      className="text-sm font-medium text-gray-400 hover:text-brand flex items-center gap-1 disabled:opacity-50 transition-colors"
                      title="Salvar no Drive"
                    >
                      {driveSaving === cert.tipo ? (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : driveSaved === cert.tipo ? (
                        <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      )}
                      {driveSaved === cert.tipo ? <span className="text-emerald-400">Salvo</span> : 'Salvar no Drive'}
                    </button>
                  )}
                  {cert.consulta_url && (
                    <a
                      href={cert.consulta_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-brand hover:text-brand/80"
                    >
                      Ver fonte oficial
                    </a>
                  )}
                </div>
              </div>
            )
          })}

          {/* Pending async certidões indicator */}
          {isPolling && (
            <div className="rounded-lg border border-blue-900/30 bg-blue-900/10 p-4">
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-blue-400 font-medium">Emitindo certidões automaticamente...</p>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {['CNDT (TST)', 'CND Federal', 'CRF FGTS'].map(name => (
                  <div key={name} className="text-xs text-gray-400 flex items-center gap-1">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Job failed */}
          {jobStatus === 'failed' && asyncCertidoes.length === 0 && (
            <div className="rounded-lg border border-amber-900/30 bg-amber-900/20 p-4">
              <p className="text-sm text-amber-400">
                Algumas certidões não puderam ser emitidas automaticamente. Use os links manuais abaixo.
              </p>
            </div>
          )}

          {/* Manual links section */}
          {manualResults.length > 0 && !isPolling && (
            <div className="rounded-lg border border-[#2d2f33] bg-[#1a1c1f] p-4">
              <h4 className="font-semibold text-base text-white mb-3 flex items-center gap-1.5">
                <span>{'\uD83D\uDCCB'}</span>
                Emitir Certidões (consulta manual)
              </h4>
              <p className="text-sm text-gray-400 mb-3">
                Emita diretamente pelo Licitagram (captcha guiado) ou abra o site do governo.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {manualResults.map((cert) => {
                  const guidedPortalType =
                    cert.tipo === 'cnd_federal' || cert.tipo === 'federal' ? 'receita' as const
                    : cert.tipo === 'fgts' ? 'fgts' as const
                    : null

                  return (
                    <div
                      key={cert.tipo}
                      className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border border-[#2d2f33] bg-[#23262a]"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-brand shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-white truncate">{cert.label}</p>
                          <p className="text-sm text-gray-400 truncate">{cert.detalhes}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {guidedPortalType && (
                          <button
                            onClick={() => setGuidedPortal(guidedPortalType)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-brand text-white rounded-md text-xs font-medium hover:bg-brand/90 transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Emitir via Licitagram
                          </button>
                        )}
                        {cert.consulta_url && (
                          <a
                            href={cert.consulta_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 border border-[#2d2f33] text-gray-400 rounded-md text-xs font-medium hover:bg-[#2d2f33] hover:text-white transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            Abrir site
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-amber-900/30 bg-amber-900/20 p-4">
              <p className="text-sm font-semibold text-amber-400 mb-1">Erros:</p>
              <ul className="text-sm text-gray-400 list-disc list-inside space-y-0.5">
                {result.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      {/* Guided Certidao Modal */}
      {guidedPortal && (
        <GuidedCertidao
          portal={guidedPortal}
          cnpj={cnpj}
          onSuccess={() => {
            setGuidedPortal(null)
            router.refresh()
          }}
          onClose={() => setGuidedPortal(null)}
        />
      )}
    </div>
  )
}

