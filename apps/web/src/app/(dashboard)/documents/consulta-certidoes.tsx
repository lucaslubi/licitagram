'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
}

const SITUACAO_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  regular: { label: 'Regular', icon: '\u2705', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  irregular: { label: 'Irregular', icon: '\u274C', color: 'text-red-700 bg-red-50 border-red-200' },
  error: { label: 'Erro', icon: '\u26A0\uFE0F', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  pending: { label: 'Pendente', icon: '\u23F3', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  manual: { label: 'Consulta Manual', icon: '\uD83D\uDD17', color: 'text-blue-700 bg-blue-50 border-blue-200' },
}

export function ConsultaCertidoes({ cnpj }: { cnpj: string; hasApiKey?: boolean }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ConsultaResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleConsultar() {
    setLoading(true)
    setError(null)
    setResult(null)

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
      router.refresh()
    } catch {
      setError('Erro de conexao. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // Split results
  const autoResults = result?.certidoes.filter(c => c.situacao !== 'manual') || []
  const manualResults = result?.certidoes.filter(c => c.situacao === 'manual') || []

  return (
    <div className="space-y-4">
      {/* Header + Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-800">Consulta de Certidoes para Habilitacao</h3>
          <p className="text-sm text-gray-500">
            Verifica sancoes e emite certidoes automaticamente quando possivel. Captchas sao resolvidos via OCR/2Captcha.
          </p>
        </div>
        <button
          onClick={handleConsultar}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-lg hover:bg-brand/90 disabled:opacity-60 text-sm font-medium shadow-sm transition-all whitespace-nowrap"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Consultando...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Verificar Habilitacao
            </>
          )}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-700 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Consultando certidoes para CNPJ {formatCnpj(cnpj)} — verificando sancoes, resolvendo captchas...
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Consultado em {new Date(result.consultado_em).toLocaleString('pt-BR')}
              {result.razao_social && ` \u2014 ${result.razao_social}`}
            </p>
            <div className="flex items-center gap-3">
              {result.saved.length > 0 && (
                <span className="text-xs text-emerald-600 font-medium">
                  {result.saved.length} certidao(oes) salva(s)
                </span>
              )}
              {autoResults.length > 0 && (
                <span className="text-xs text-brand font-medium bg-brand/10 px-2 py-0.5 rounded-full">
                  {autoResults.length} automatica(s)
                </span>
              )}
            </div>
          </div>

          {/* Automatic results (TCU, solved captchas, etc.) */}
          {autoResults.map((cert) => {
            const config = SITUACAO_CONFIG[cert.situacao] || SITUACAO_CONFIG.pending
            return (
              <div key={cert.tipo} className={`rounded-lg border p-4 ${config.color}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm flex items-center gap-1.5">
                      <span>{config.icon}</span>
                      {cert.label}
                    </p>
                    <p className="text-xs mt-1 opacity-80">{cert.detalhes}</p>
                    {cert.numero && (
                      <p className="text-xs mt-1 font-mono opacity-70">N\u00BA {cert.numero}</p>
                    )}
                    {cert.validade && (
                      <p className="text-xs mt-0.5 opacity-70">
                        Validade: {new Date(cert.validade).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full bg-white/50">
                    {config.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  {cert.pdf_url && (
                    <a
                      href={cert.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline opacity-70 hover:opacity-100 flex items-center gap-1"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Baixar PDF
                    </a>
                  )}
                  {cert.consulta_url && (
                    <a
                      href={cert.consulta_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline opacity-70 hover:opacity-100"
                    >
                      Ver fonte oficial
                    </a>
                  )}
                </div>
              </div>
            )
          })}

          {/* Manual links section — only show if there are manual ones */}
          {manualResults.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h4 className="font-medium text-sm text-gray-700 mb-3 flex items-center gap-1.5">
                <span>\uD83D\uDCCB</span>
                Emitir Certidoes (consulta manual)
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                Estas certidoes nao puderam ser emitidas automaticamente (captcha nao resolvido ou site indisponivel).
                Clique no link para abrir o site do governo e emitir manualmente.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {manualResults.map((cert) => (
                  <a
                    key={cert.tipo}
                    href={cert.consulta_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 hover:border-brand hover:bg-brand/5 transition-colors ${!cert.consulta_url ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <svg className="h-4 w-4 text-brand shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{cert.label}</p>
                      <p className="text-xs text-gray-400 truncate">{cert.detalhes}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800 mb-1">Erros:</p>
              <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
                {result.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatCnpj(cnpj: string): string {
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14) return cnpj
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
}
