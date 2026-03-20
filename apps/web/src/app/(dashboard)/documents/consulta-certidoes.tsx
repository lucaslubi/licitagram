'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface CertidaoResultItem {
  tipo: string
  label: string
  situacao: 'regular' | 'irregular' | 'error' | 'pending'
  detalhes: string
  numero: string | null
  emissao: string | null
  validade: string | null
  pdf_url: string | null
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

const SITUACAO_CONFIG = {
  regular: { label: 'Regular', icon: '✅', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  irregular: { label: 'Irregular', icon: '❌', color: 'text-red-700 bg-red-50 border-red-200' },
  error: { label: 'Erro', icon: '⚠️', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  pending: { label: 'Pendente', icon: '⏳', color: 'text-gray-600 bg-gray-50 border-gray-200' },
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
        body: JSON.stringify({}),
      })

      const data: ConsultaResponse = await res.json()

      if (!res.ok || data.error) {
        setError(data.error || 'Erro ao consultar certidões')
        return
      }

      setResult(data)
      router.refresh() // Refresh the page to show updated documents table
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header + Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-800">Consulta Automática de Certidões</h3>
          <p className="text-sm text-gray-500">
            Puxa automaticamente CND Federal, FGTS, CNDT e TCU direto dos órgãos.
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Consultar Certidões
            </>
          )}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-700 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Consultando órgãos federais... Isso pode levar até 60 segundos.
          </p>
          <p className="text-xs text-blue-500 mt-1">
            CNPJ: {formatCnpj(cnpj)} — Consultando TST, TCU, Receita Federal e Caixa diretamente...
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
              {result.razao_social && ` — ${result.razao_social}`}
            </p>
            {result.saved.length > 0 && (
              <span className="text-xs text-emerald-600 font-medium">
                {result.saved.length} certidão(ões) atualizada(s)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.certidoes.map((cert) => {
              const config = SITUACAO_CONFIG[cert.situacao]
              return (
                <div
                  key={cert.tipo}
                  className={`rounded-lg border p-4 ${config.color}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm flex items-center gap-1.5">
                        <span>{config.icon}</span>
                        {cert.label}
                      </p>
                      <p className="text-xs mt-1 opacity-80 line-clamp-2">{cert.detalhes}</p>
                    </div>
                    <span className="text-xs font-semibold shrink-0">{config.label}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs opacity-70">
                    {cert.numero && <span>N: {cert.numero}</span>}
                    {cert.validade && (
                      <span>Val: {new Date(cert.validade).toLocaleDateString('pt-BR')}</span>
                    )}
                    {cert.pdf_url && (
                      <a
                        href={cert.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:no-underline"
                      >
                        Baixar PDF
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800 mb-1">Erros na consulta:</p>
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
