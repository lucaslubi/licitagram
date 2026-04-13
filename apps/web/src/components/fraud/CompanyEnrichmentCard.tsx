'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCNPJ, formatCurrencyBR as formatBRL } from '@/lib/format'

interface EmpresaData {
  cnpj: string
  razao_social: string | null
  nome_fantasia: string | null
  natureza_juridica: string | null
  capital_social: number | null
  porte_empresa: string | null
  data_inicio_atividade: string | null
  situacao_cadastral: string | null
  endereco: string | null
  municipio: string | null
  uf: string | null
}

interface Socio {
  nome_socio: string
  qualificacao_socio: string
  data_entrada: string | null
}

interface SanctionData {
  sancionado: boolean
  sancoes: Array<{
    cadastro: string
    orgao_sancionador: string
    categoria: string
    observacoes: string
  }>
}

interface Props {
  cnpj: string
  competitorName?: string
  hasAccess: boolean // true for Professional and Enterprise
}

export function CompanyEnrichmentCard({ cnpj, competitorName, hasAccess }: Props) {
  const [empresa, setEmpresa] = useState<EmpresaData | null>(null)
  const [socios, setSocios] = useState<Socio[]>([])
  const [sancoes, setSancoes] = useState<SanctionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!hasAccess) { setLoading(false); return }

    const clean = cnpj.replace(/\D/g, '')

    Promise.all([
      fetch(`/api/enrichment/empresa/${clean}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/enrichment/socios/${clean}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/enrichment/sancoes/${clean}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([emp, soc, san]) => {
      if (emp) setEmpresa(emp)
      if (soc?.socios) setSocios(soc.socios)
      if (san) setSancoes(san)
      if (!emp && !soc && !san) setError(true)
      setLoading(false)
    })
  }, [cnpj, hasAccess])

  if (!hasAccess) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-[#2d2f33] rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-white">Dados da Empresa</h3>
              <p className="text-sm text-gray-400 mt-1">
                Dados completos da Receita Federal e grafo societario.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Disponivel nos planos Profissional e Enterprise
              </p>
            </div>
            <a href="/billing" className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand/10 text-brand rounded-lg text-sm font-medium hover:bg-brand/20 transition-colors">
              Fazer upgrade
            </a>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Dados da Empresa</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 bg-[#2d2f33] rounded animate-pulse w-3/4" />
            <div className="h-4 bg-[#2d2f33] rounded animate-pulse w-1/2" />
            <div className="h-4 bg-[#2d2f33] rounded animate-pulse w-2/3" />
            <div className="h-12 bg-[#2d2f33] rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !empresa) {
    return (
      <Card>
        <CardHeader><CardTitle>Dados da Empresa</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">Dados da Receita Federal indisponiveis no momento.</p>
        </CardContent>
      </Card>
    )
  }

  const porteLabel: Record<string, string> = {
    '00': 'Nao informado', '01': 'Micro Empresa', '03': 'Empresa de Pequeno Porte', '05': 'Demais'
  }

  const situacaoColor: Record<string, string> = {
    '02': 'text-emerald-400', // Ativa
    '03': 'text-amber-400',   // Suspensa
    '04': 'text-red-400',     // Inapta
    '08': 'text-red-400',     // Baixada
  }
  const situacaoLabel: Record<string, string> = {
    '01': 'Nula', '02': 'Ativa', '03': 'Suspensa', '04': 'Inapta', '08': 'Baixada'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Dados da Empresa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sanctions banner */}
        {sancoes?.sancionado && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-sm font-bold text-red-400 flex items-center gap-2">
              <span>⚠️</span> EMPRESA SANCIONADA
            </p>
            {sancoes.sancoes.map((s, i) => (
              <p key={i} className="text-xs text-red-300 mt-1">
                {s.cadastro} — {s.orgao_sancionador} {s.observacoes && `(${s.observacoes})`}
              </p>
            ))}
          </div>
        )}

        {/* Company info grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Razao Social</p>
            <p className="text-sm text-white font-medium">{empresa.razao_social || competitorName || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">CNPJ</p>
            <p className="text-sm text-gray-300 font-mono">{formatCNPJ(cnpj)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Capital Social</p>
            <p className="text-sm text-white">{empresa.capital_social ? formatBRL(empresa.capital_social) : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Porte</p>
            <p className="text-sm text-gray-300">{porteLabel[empresa.porte_empresa || ''] || empresa.porte_empresa || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Situacao</p>
            <p className={`text-sm font-medium ${situacaoColor[empresa.situacao_cadastral || ''] || 'text-gray-300'}`}>
              {situacaoLabel[empresa.situacao_cadastral || ''] || empresa.situacao_cadastral || '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Abertura</p>
            <p className="text-sm text-gray-300">
              {empresa.data_inicio_atividade
                ? new Date(empresa.data_inicio_atividade).toLocaleDateString('pt-BR')
                : '—'}
            </p>
          </div>
        </div>

        {/* Socios */}
        {socios.length > 0 && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Quadro Societario ({socios.length})</p>
            <div className="space-y-1.5">
              {socios.slice(0, 10).map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-[#2d2f33] last:border-0">
                  <div>
                    <p className="text-xs text-white">{s.nome_socio}</p>
                    <p className="text-[10px] text-gray-500">{s.qualificacao_socio}</p>
                  </div>
                  {s.data_entrada && (
                    <span className="text-[10px] text-gray-500">
                      {new Date(s.data_entrada).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              ))}
              {socios.length > 10 && (
                <p className="text-[10px] text-gray-500">+ {socios.length - 10} socios</p>
              )}
            </div>
          </div>
        )}

        {/* No sanctions */}
        {sancoes && !sancoes.sancionado && (
          <div className="flex items-center gap-2 text-emerald-400">
            <span>✅</span>
            <span className="text-xs">Sem sancoes ativas</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
