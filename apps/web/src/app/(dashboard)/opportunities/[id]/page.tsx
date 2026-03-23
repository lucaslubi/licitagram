import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@licitagram/shared'
import type { TenderDetail, TenderDocument } from '@/types/database'
import { StatusChanger } from './status-changer'
import { ComplianceChecker } from './compliance-checker'
import { EditalChat } from './chat'
import { HistoricalPrices } from './historical-prices'
import { ScoreProvider, ScoreBadgeSlot, AnalysisSlot } from './score-header'
import { AnalyzeWithAIButton } from './document-link'
import { getAuthAndProfile, getMatchDetail } from '@/lib/cache'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // PARALLEL: auth + match detail (cached 1 min)
  const [auth, match, user] = await Promise.all([
    getAuthAndProfile(),
    getMatchDetail(id),
    getUserWithPlan(),
  ])

  if (!auth) redirect('/login')
  if (!match) notFound()

  const hasChatIa = user ? hasFeature(user, 'chat_ia') : false
  const hasComplianceChecker = user ? hasFeature(user, 'compliance_checker') : false
  const isEnterprise = user?.plan?.slug === 'enterprise' || user?.isPlatformAdmin === true

  const companyId = auth.companyId

  const tender = (match.tenders || {}) as unknown as TenderDetail
  if (!tender || !tender.id) notFound()

  // ── Competition Analysis: fetch niche competitors ──
  const tenderUf = tender?.uf as string | null
  const supabase = await createClient()

  // Fetch company CNAE divisions
  const companyCnaeDivisions: string[] = []
  if (companyId) {
    const { data: company } = await supabase
      .from('companies')
      .select('cnae_principal, cnaes_secundarios')
      .eq('id', companyId)
      .single()
    if (company?.cnae_principal) companyCnaeDivisions.push(company.cnae_principal.substring(0, 2))
    if (company?.cnaes_secundarios) {
      for (const c of company.cnaes_secundarios as string[]) {
        const div = c.substring(0, 2)
        if (!companyCnaeDivisions.includes(div)) companyCnaeDivisions.push(div)
      }
    }
  }

  let nicheCompetitors: Array<Record<string, unknown>> = []
  if (tenderUf && companyCnaeDivisions.length > 0) {
    try {
      const allResults: Array<Record<string, unknown>> = []
      for (const cnaeDiv of companyCnaeDivisions.slice(0, 3)) {
        const { data: stats } = await supabase.rpc('find_competitors_by_cnae_uf', {
          p_cnae_divisao: cnaeDiv,
          p_uf: tenderUf,
          p_limit: 10,
        })
        if (stats) allResults.push(...stats)
      }
      const seen = new Set<string>()
      nicheCompetitors = allResults.filter((s) => {
        const cnpj = s.cnpj as string
        if (seen.has(cnpj)) return false
        seen.add(cnpj)
        return true
      }).slice(0, 10)
    } catch (e) {
      console.error('Failed to fetch niche competitors:', e)
    }
  }
  const breakdown = (match.breakdown as Array<{ category: string; score: number; reason: string }>) || []
  const requisitos = tender?.requisitos as Record<string, unknown> | null
  const riscos = (match.riscos as string[]) || []
  const acoesNecessarias = (match.acoes_necessarias as string[]) || []
  const recomendacao = match.recomendacao as string | null
  // Use actual match_source from database (not inference)
  const matchSource = (match.match_source as string) || 'keyword'
  const documents = ((tender?.tender_documents as unknown) as Array<{
    id: string; titulo: string | null; tipo: string | null; url: string; texto_extraido: string | null; status: string
  }>) || []

  return (
    <ScoreProvider
      initialScore={match.score}
      initialKeywordScore={(match.keyword_score as number) ?? null}
      matchSource={matchSource}
      matchId={String(match.id)}
      hasAccess={hasChatIa}
      initialData={{
        score: Number(match.score) || 0,
        breakdown: breakdown as Array<{ category: string; score?: number; fit?: string; reason: string }>,
        justificativa: (match.ai_justificativa as string) || null,
        recomendacao: recomendacao || null,
        riscos: riscos as string[],
        acoes_necessarias: acoesNecessarias as string[],
      }}
    >
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6">
        <Link href="/opportunities" className="text-sm text-gray-400 hover:text-gray-900">
          ← Voltar
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold flex-1">Detalhes da Oportunidade</h1>
        <ScoreBadgeSlot />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tender info */}
          <Card>
            <CardHeader>
              <CardTitle>Informações do Edital</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-400">Objeto</label>
                <p className="text-sm">{(tender?.objeto as string) || 'N/A'}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-400">Órgão</label>
                  <p className="text-sm">{(tender?.orgao_nome as string) || ''}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-400">CNPJ do Órgão</label>
                  <p className="text-sm">{(tender?.orgao_cnpj as string) || ''}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-400">Modalidade</label>
                  <p className="text-sm">{(tender?.modalidade_nome as string) || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-400">UF</label>
                  <p className="text-sm">{(tender?.uf as string) || ''}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-400">Município</label>
                  <p className="text-sm">{(tender?.municipio as string) || '-'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-400">Valor Estimado</label>
                  <p className="text-sm font-medium text-emerald-700">
                    {tender?.valor_estimado
                      ? formatCurrency(tender.valor_estimado as number)
                      : 'Não informado'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-400">Valor Homologado</label>
                  <p className="text-sm font-medium">
                    {tender?.valor_homologado
                      ? formatCurrency(tender.valor_homologado as number)
                      : '-'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-400">Situação</label>
                  <p className="text-sm">{(tender?.situacao_nome as string) || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-400">Data Publicação</label>
                  <p className="text-sm">
                    {tender?.data_publicacao ? formatDate(tender.data_publicacao as string) : '-'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-400">Data Abertura</label>
                  <p className="text-sm">
                    {tender?.data_abertura ? formatDate(tender.data_abertura as string) : '-'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-400">Data Encerramento</label>
                  {tender?.data_encerramento ? (
                    <p className={`text-sm font-medium ${
                      new Date(tender.data_encerramento as string) < new Date()
                        ? 'text-red-600'
                        : 'text-emerald-700'
                    }`}>
                      {formatDate(tender.data_encerramento as string)}
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-amber-600 flex items-center gap-1">
                      ⚠️ Não informada — Pergunte ao consultor IA
                    </p>
                  )}
                </div>
              </div>
              {Boolean(tender?.resumo) && (
                <div>
                  <label className="text-sm font-medium text-gray-400">Resumo</label>
                  <p className="text-sm bg-gray-100 p-3 rounded-md">{tender.resumo as string}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── AI Chat — Feature Principal (full width within main column) ── */}
          <div id="edital-chat">
            <EditalChat
              tenderId={(tender?.id as string) || id}
              documentCount={documents.length}
              documentUrls={documents.filter(d => d.url).map(d => ({ id: d.id, titulo: d.titulo, tipo: d.tipo, url: d.url }))}
              hasAccess={hasChatIa}
            />
          </div>

          <AnalysisSlot />

          {/* Competition Analysis Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Análise Competitiva
                {match.competition_score != null && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    (match.competition_score as number) >= 75 ? 'bg-green-100 text-green-700' :
                    (match.competition_score as number) >= 50 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {match.competition_score as number}/100
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Factor breakdown */}
              {match.competition_score != null && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500">Concorrentes no nicho</div>
                    <div className="font-medium">{nicheCompetitors.length}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-gray-500">Competitividade</div>
                    <div className="font-medium">
                      {(match.competition_score as number) >= 75 ? 'Baixa' : (match.competition_score as number) >= 50 ? 'Moderada' : 'Alta'}
                    </div>
                  </div>
                </div>
              )}

              {/* Known competitors table (enterprise: names, others: count + lock) */}
              {isEnterprise && nicheCompetitors.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 font-medium">Principais concorrentes:</div>
                  {nicheCompetitors.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                      <span className="font-medium">{(c.razao_social as string) || 'N/I'}</span>
                      <span className="text-gray-500">
                        Win rate {Math.round(Number(c.win_rate || 0) * 100)}% · {(c.porte as string) || 'N/I'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : nicheCompetitors.length > 0 ? (
                <div className="text-xs text-gray-500">
                  {nicheCompetitors.length} concorrentes identificados neste nicho.
                  <span className="text-blue-600 ml-1">🔒 Nomes no plano Enterprise</span>
                </div>
              ) : (
                <div className="text-xs text-gray-400">Sem dados competitivos para esta licitação.</div>
              )}
            </CardContent>
          </Card>

          {/* Requirements */}
          {requisitos && (requisitos as Record<string, any>).requisitos && (
            <Card>
              <CardHeader>
                <CardTitle>Requisitos Extraídos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(
                    (requisitos as Record<string, any>).requisitos as Array<{
                      categoria: string
                      descricao: string
                      obrigatorio: boolean
                    }>
                  ).map((req, i) => (
                    <div key={i} className="flex gap-3 p-3 border rounded-md">
                      <Badge
                        variant={req.obrigatorio ? 'default' : 'secondary'}
                        className="shrink-0 h-fit"
                      >
                        {req.obrigatorio ? 'Obrigatório' : 'Desejável'}
                      </Badge>
                      <div>
                        <p className="text-xs font-medium text-gray-400 uppercase">
                          {req.categoria}
                        </p>
                        <p className="text-sm">{req.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Documentos do Edital */}
          {documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Documentos do Edital
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {doc.titulo || 'Documento sem título'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {doc.tipo && (
                            <Badge variant="outline" className="text-xs">
                              {doc.tipo}
                            </Badge>
                          )}
                          {doc.status === 'error' ? (
                            <AnalyzeWithAIButton />
                          ) : (
                            <Badge
                              variant={doc.status === 'done' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {doc.status === 'done' ? 'Extraído' : 'Pendente'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 ml-3 text-sm text-brand hover:underline"
                      >
                        Download →
                      </a>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Compliance Checker */}
          {companyId && requisitos && (requisitos as Record<string, any>).requisitos && (
            <ComplianceChecker
              companyId={companyId}
              hasAccess={hasComplianceChecker}
              requisitos={
                ((requisitos as Record<string, any>).requisitos as Array<{
                  categoria: string
                  descricao: string
                  obrigatorio: boolean
                }>) || []
              }
            />
          )}

          {/* Historical Prices */}
          <HistoricalPrices
            currentObjeto={(tender?.objeto as string) || ''}
            currentValorEstimado={(tender?.valor_estimado as number) || null}
            currentTenderId={(tender?.id as string) || id}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusChanger matchId={match.id} currentStatus={match.status} />
            </CardContent>
          </Card>

          {/* Recommendation */}
          {recomendacao && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-xs font-medium text-gray-400 uppercase mb-2">Recomendação IA</p>
                  <Badge
                    className={`text-sm px-3 py-1 ${
                      recomendacao === 'participar'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : recomendacao === 'avaliar_melhor'
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-red-100 text-red-800 border-red-200'
                    }`}
                    variant="outline"
                  >
                    {recomendacao === 'participar'
                      ? 'Participar'
                      : recomendacao === 'avaliar_melhor'
                        ? 'Avaliar Melhor'
                        : 'Não Recomendado'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {(() => {
            const pncpId = tender?.pncp_id ? String(tender.pncp_id) : null
            const pncpUrl = pncpId
              ? `https://pncp.gov.br/app/editais/${pncpId.replace(/-/g, '/')}`
              : null
            const linkPncp = (tender?.link_pncp as string | null) || pncpUrl
            const externalUrl = tender?.link_sistema_origem as string | null

            if (!linkPncp && !externalUrl) return null

            return (
              <Card>
                <CardContent className="pt-6 space-y-2">
                  {linkPncp && (
                    <a
                      href={linkPncp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm text-brand hover:underline"
                    >
                      Ver no PNCP →
                    </a>
                  )}
                  {externalUrl && (
                    <a
                      href={externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm text-brand hover:underline"
                    >
                      Acessar Sistema de Origem →
                    </a>
                  )}
                </CardContent>
              </Card>
            )
          })()}

        </div>
      </div>
    </div>
    </ScoreProvider>
  )
}
