'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Requisito {
  categoria: string
  descricao: string
  obrigatorio: boolean
}

interface CompanyDoc {
  id: string
  tipo: string
  descricao: string | null
  validade: string | null
  numero: string | null
}

interface ComplianceItem {
  requisito: string
  categoria: string
  obrigatorio: boolean
  status: 'ok' | 'warning' | 'missing'
  matchedDoc?: CompanyDoc
  message: string
}

// Map from requirement categories to document types
const CATEGORY_TO_DOC_TYPE: Record<string, string[]> = {
  habilitacao_juridica: ['contrato_social'],
  qualificacao_tecnica: ['atestado_capacidade', 'crea_cau'],
  qualificacao_economica: ['balanco'],
  regularidade_fiscal: ['cnd_federal', 'cnd_estadual', 'cnd_municipal', 'fgts', 'trabalhista'],
  regularidade_trabalhista: ['trabalhista'],
  documentacao: ['sicaf', 'cnd_federal', 'cnd_estadual', 'cnd_municipal', 'fgts', 'trabalhista'],
}

// Keyword-based matching for requirement descriptions
const KEYWORD_TO_DOC_TYPE: Record<string, string[]> = {
  'cnpj': ['contrato_social'],
  'receita': ['cnd_federal'],
  'pgfn': ['cnd_federal'],
  'federal': ['cnd_federal'],
  'estadual': ['cnd_estadual'],
  'municipal': ['cnd_municipal'],
  'fgts': ['fgts'],
  'trabalhist': ['trabalhista'],
  'cndt': ['trabalhista'],
  'sicaf': ['sicaf'],
  'atestado': ['atestado_capacidade'],
  'capacidade tecnica': ['atestado_capacidade'],
  'balanco': ['balanco'],
  'patrimonial': ['balanco'],
  'contrato social': ['contrato_social'],
  'estatuto': ['contrato_social'],
  'iso': ['iso_9001'],
  'alvara': ['alvara'],
  'crea': ['crea_cau'],
  'cau': ['crea_cau'],
}

export function ComplianceChecker({
  companyId,
  requisitos,
  hasAccess = true,
}: {
  companyId: string
  requisitos: Requisito[]
  hasAccess?: boolean
}) {
  if (!hasAccess) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Checklist de Compliance</h3>
              <p className="text-sm text-gray-500 mt-1">
                Verifique automaticamente se sua empresa atende aos requisitos do edital.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Disponível nos planos Professional e Enterprise
              </p>
            </div>
            <a
              href="/billing"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand/10 text-brand rounded-lg text-sm font-medium hover:bg-brand/20 transition-colors"
            >
              Fazer upgrade
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
          </div>
        </CardContent>
      </Card>
    )
  }
  const [items, setItems] = useState<ComplianceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [score, setScore] = useState(0)

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: docs } = await supabase
        .from('company_documents')
        .select('id, tipo, descricao, validade, numero')
        .eq('company_id', companyId)

      const companyDocs = (docs || []) as CompanyDoc[]
      const today = new Date()
      const results: ComplianceItem[] = []

      for (const req of requisitos) {
        // Find matching doc types for this requirement
        let matchingTypes: string[] = []

        // First try category-based matching
        const catKey = req.categoria.toLowerCase().replace(/\s+/g, '_')
        if (CATEGORY_TO_DOC_TYPE[catKey]) {
          matchingTypes = CATEGORY_TO_DOC_TYPE[catKey]
        }

        // Then try keyword-based matching on description
        const descLower = (req.descricao || '').toLowerCase()
        for (const [keyword, docTypes] of Object.entries(KEYWORD_TO_DOC_TYPE)) {
          if (descLower.includes(keyword)) {
            matchingTypes = [...new Set([...matchingTypes, ...docTypes])]
          }
        }

        if (matchingTypes.length === 0) {
          results.push({
            requisito: req.descricao,
            categoria: req.categoria,
            obrigatorio: req.obrigatorio,
            status: 'missing',
            message: 'Não foi possível verificar automaticamente',
          })
          continue
        }

        // Check if any matching document exists and is valid
        const matchedDoc = companyDocs.find((d) => matchingTypes.includes(d.tipo))
        if (!matchedDoc) {
          results.push({
            requisito: req.descricao,
            categoria: req.categoria,
            obrigatorio: req.obrigatorio,
            status: 'missing',
            message: 'Documento não cadastrado',
          })
          continue
        }

        // Check validity
        if (matchedDoc.validade) {
          const valDate = new Date(matchedDoc.validade)
          const daysLeft = Math.ceil((valDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

          if (daysLeft < 0) {
            results.push({
              requisito: req.descricao,
              categoria: req.categoria,
              obrigatorio: req.obrigatorio,
              status: 'missing',
              matchedDoc,
              message: `Documento vencido há ${Math.abs(daysLeft)} dias`,
            })
            continue
          }

          if (daysLeft <= 30) {
            results.push({
              requisito: req.descricao,
              categoria: req.categoria,
              obrigatorio: req.obrigatorio,
              status: 'warning',
              matchedDoc,
              message: `Vence em ${daysLeft} dias`,
            })
            continue
          }
        }

        results.push({
          requisito: req.descricao,
          categoria: req.categoria,
          obrigatorio: req.obrigatorio,
          status: 'ok',
          matchedDoc,
          message: matchedDoc.validade
            ? `Válido até ${new Date(matchedDoc.validade).toLocaleDateString('pt-BR')}`
            : 'Cadastrado (sem validade)',
        })
      }

      // Calculate compliance score
      const total = results.length
      const okCount = results.filter((r) => r.status === 'ok').length
      const warningCount = results.filter((r) => r.status === 'warning').length
      const compScore = total > 0 ? Math.round(((okCount + warningCount * 0.5) / total) * 100) : 0

      setItems(results)
      setScore(compScore)
      setLoading(false)
    }

    if (requisitos.length > 0) {
      check()
    } else {
      setLoading(false)
    }
  }, [companyId, requisitos])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-gray-500">
          Verificando compliance...
        </CardContent>
      </Card>
    )
  }

  if (requisitos.length === 0) return null

  const okCount = items.filter((i) => i.status === 'ok').length
  const warnCount = items.filter((i) => i.status === 'warning').length
  const missCount = items.filter((i) => i.status === 'missing').length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span>✅</span> Checklist de Compliance
          </span>
          <Badge
            variant="outline"
            className={`text-sm ${
              score >= 80
                ? 'bg-green-100 text-green-800 border-green-200'
                : score >= 50
                  ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                  : 'bg-red-100 text-red-800 border-red-200'
            }`}
          >
            {score}%
          </Badge>
        </CardTitle>
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="text-green-600">{okCount} OK</span>
          <span className="text-yellow-600">{warnCount} Atenção</span>
          <span className="text-red-600">{missCount} Pendente</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 p-3 rounded-md border text-sm ${
              item.status === 'ok'
                ? 'bg-green-50 border-green-200'
                : item.status === 'warning'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-red-50 border-red-200'
            }`}
          >
            <span className="shrink-0 mt-0.5">
              {item.status === 'ok' ? '✅' : item.status === 'warning' ? '⚠️' : '❌'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 line-clamp-2">{item.requisito}</p>
              <p className="text-xs text-gray-500 mt-0.5">{item.message}</p>
            </div>
            {item.obrigatorio && (
              <Badge variant="outline" className="shrink-0 text-xs">Obrig.</Badge>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
