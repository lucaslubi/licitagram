import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@licitagram/shared'
import type { TenderDetail } from '@/types/database'
import { StatusChanger } from './status-changer'
import { ComplianceChecker } from './compliance-checker'
import { EditalChat } from './chat'
import { HistoricalPrices } from './historical-prices'
import { ScoreProvider, ScoreBadgeSlot, AnalysisSlot } from './score-header'
import { AnalyzeWithAIButton } from './document-link'
import { getAuthAndProfile, getMatchDetail } from '@/lib/cache'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import { RiskAnalysisCard } from '@/components/fraud/RiskAnalysisCard'
import { FraudAlertBadges } from '@/components/fraud/FraudAlertBadges'
import { HabilitacaoChecklist } from './habilitacao-checklist'
import { LanceSimulator } from './lance-simulator'
import { ImpugnationCard } from './impugnation-card'
import { TenderPricing } from './tender-pricing'
import { formatCompactBRL } from '@/lib/geo/map-utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deadlineInfo(dateStr: string | null): { days: number; label: string; urgent: boolean; past: boolean } | null {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff < 0) return { days: Math.abs(diff), label: 'Encerrado', urgent: true, past: true }
  if (diff === 0) return { days: 0, label: 'Hoje', urgent: true, past: false }
  return { days: diff, label: `${diff}d`, urgent: diff <= 3, past: false }
}

function deadlineProgress(abertura: string | null, encerramento: string | null): number {
  if (!abertura || !encerramento) return 0
  const start = new Date(abertura).getTime()
  const end = new Date(encerramento).getTime()
  const now = Date.now()
  if (now >= end) return 100
  if (now <= start) return 0
  return Math.round(((now - start) / (end - start)) * 100)
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

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

  // ── Competition Analysis ──
  const tenderUf = tender?.uf as string | null
  const supabase = await createClient()

  const tenderCnaeDivisions: string[] = []
  const tenderCnaes = (tender as unknown as Record<string, unknown>)?.cnaes as string[] | null
  if (tenderCnaes && tenderCnaes.length > 0) {
    for (const c of tenderCnaes) {
      const div = c.substring(0, 2)
      if (!tenderCnaeDivisions.includes(div)) tenderCnaeDivisions.push(div)
    }
  }
  if (tenderCnaeDivisions.length === 0 && companyId) {
    const { data: company } = await supabase
      .from('companies')
      .select('cnae_principal, cnaes_secundarios')
      .eq('id', companyId)
      .single()
    if (company?.cnae_principal) tenderCnaeDivisions.push(company.cnae_principal.substring(0, 2))
    if (company?.cnaes_secundarios) {
      for (const c of company.cnaes_secundarios as string[]) {
        const div = c.substring(0, 2)
        if (!tenderCnaeDivisions.includes(div)) tenderCnaeDivisions.push(div)
      }
    }
  }

  let nicheCompetitors: Array<Record<string, unknown>> = []
  if (tenderUf && tenderCnaeDivisions.length > 0) {
    try {
      const allResults: Array<Record<string, unknown>> = []
      const rpcCalls = tenderCnaeDivisions.slice(0, 3).map(cnaeDiv =>
        supabase.rpc('find_competitors_by_cnae_uf', { p_cnae_divisao: cnaeDiv, p_uf: tenderUf, p_limit: 10 })
      )
      const results = await Promise.all(rpcCalls)
      for (const { data: stats } of results) {
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
  const matchSource = (match.match_source as string) || 'keyword'
  const documents = ((tender?.tender_documents as unknown) as Array<{
    id: string; titulo: string | null; tipo: string | null; url: string; texto_extraido: string | null; status: string
  }>) || []

  const dl = deadlineInfo(tender?.data_encerramento as string | null)
  const dlProgress = deadlineProgress(tender?.data_abertura as string | null, tender?.data_encerramento as string | null)

  // External links
  const pncpId = tender?.pncp_id ? String(tender.pncp_id) : null
  const pncpUrl = pncpId ? `https://pncp.gov.br/app/editais/${pncpId.replace(/-/g, '/')}` : null
  const linkPncp = (tender?.link_pncp as string | null) || pncpUrl
  const externalUrl = tender?.link_sistema_origem as string | null

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
    <div className="opp-detail-page">
      {/* ━━━ STICKY HEADER ━━━ */}
      <div className="opp-header">
        <div className="opp-header-content">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 mb-3">
            <Link href="/opportunities" className="opp-back-btn" title="Voltar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </Link>
            <Link href="/opportunities" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Oportunidades</Link>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/40"><path d="M9 18l6-6-6-6" /></svg>
            <span className="text-[11px] font-medium text-foreground">Detalhes</span>
          </nav>

          {/* Title row + score + CTA */}
          <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {!!(tender?.modalidade_nome) && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border bg-foreground/5 text-muted-foreground border-border">
                    {String(tender.modalidade_nome)}
                  </span>
                )}
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border bg-foreground/5 text-muted-foreground border-border">
                  {(tender?.source as string) === 'comprasgov' ? 'Compras.gov' : 'PNCP'}
                </span>
              </div>
              <h1 className="text-lg lg:text-xl font-semibold text-foreground tracking-tight leading-snug mb-2 max-w-3xl">
                {(tender?.objeto as string) || 'N/A'}
              </h1>
              <div className="flex items-center gap-2 flex-wrap text-[12px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 7v1a3 3 0 006 0V7m0 1a3 3 0 006 0V7m0 1a3 3 0 006 0V7H3l2-4h14l2 4M5 21V10.87M19 21V10.87" /></svg>
                  {(tender?.orgao_nome as string) || ''}
                </span>
                <span className="text-muted-foreground/30 text-[8px]">·</span>
                <span className="inline-flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  {tender?.municipio ? `${tender.municipio}, ` : ''}{(tender?.uf as string) || ''}
                </span>
                {tender?.valor_estimado && (
                  <>
                    <span className="text-muted-foreground/30 text-[8px]">·</span>
                    <span className="font-mono tabular-nums font-semibold text-foreground">
                      {formatCurrency(tender.valor_estimado as number)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="opp-header-score-wrap">
                <ScoreBadgeSlot />
              </div>
              <div className="flex flex-col gap-1.5">
                <Link
                  href={`/proposals/generate/${match.id}`}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Gerar Proposta
                </Link>
                {linkPncp && (
                  <a href={linkPncp} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors text-center">
                    Ver no PNCP &rarr;
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ━━━ 2-COLUMN LAYOUT ━━━ */}
      <div className="opp-layout">
        {/* ── MAIN COLUMN ── */}
        <main className="opp-main">

          {/* AI Consultant Hero */}
          <div className="ai-hero" id="edital-chat">
            <div className="ai-hero-glow" />
            <div className="ai-hero-grid" />
            <div className="ai-hero-content">
              <div className="ai-hero-icon-wrap">
                <div className="ai-hero-icon-glow" />
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
                  <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="ai-hero-tag">
                  <span className="ai-hero-tag-dot" />
                  CONSULTOR IA
                </div>
                <h2 className="text-lg font-semibold text-foreground tracking-tight mb-2">
                  Análise estratégica completa deste edital
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-xl">
                  Nossa IA fará a leitura integral do edital, identificará riscos, requisitos críticos e gerará recomendações táticas.
                </p>
                <div className="flex items-center gap-2 flex-wrap mb-5">
                  <span className="opp-feature-pill">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
                    {documents.length} documento{documents.length !== 1 ? 's' : ''}
                  </span>
                  <span className="opp-feature-pill">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                    Análise em ~40s
                  </span>
                  <span className="opp-feature-pill">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                    Lei 14.133
                  </span>
                </div>
                <EditalChat
                  tenderId={(tender?.id as string) || id}
                  documentCount={documents.length}
                  documentUrls={documents.filter(d => d.url).map(d => ({ id: d.id, titulo: d.titulo, tipo: d.tipo, url: d.url, text: d.texto_extraido }))}
                  hasAccess={hasChatIa}
                />
              </div>
            </div>
          </div>

          {/* AI Analysis (Score breakdown, compatibility donut, risks) */}
          <AnalysisSlot />

          {/* Competition Analysis */}
          <div className="card-refined">
            <div className="card-refined-header">
              <div className="flex items-center gap-2.5">
                <div className="card-refined-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
                </div>
                <div>
                  <h3 className="card-refined-title">Análise Competitiva</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{nicheCompetitors.length} concorrentes identificados</p>
                </div>
              </div>
              {match.competition_score != null && (
                <span className={`text-xs font-semibold font-mono tabular-nums px-2 py-0.5 rounded-md border ${
                  (match.competition_score as number) >= 75 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  (match.competition_score as number) >= 50 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                  'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                  {match.competition_score as number}/100
                </span>
              )}
            </div>

            {match.competition_score != null && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-background rounded-lg p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Concorrentes</div>
                  <div className="font-semibold text-foreground font-mono tabular-nums mt-0.5">{nicheCompetitors.length}</div>
                </div>
                <div className="bg-background rounded-lg p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Competitividade</div>
                  <div className={`font-semibold mt-0.5 ${
                    nicheCompetitors.length <= 3 ? 'text-emerald-400' :
                    nicheCompetitors.length <= 7 ? 'text-lime-400' :
                    nicheCompetitors.length <= 15 ? 'text-amber-400' :
                    'text-red-400'
                  }`}>
                    {nicheCompetitors.length <= 3 ? 'Muito Baixa' :
                     nicheCompetitors.length <= 7 ? 'Baixa' :
                     nicheCompetitors.length <= 15 ? 'Média' :
                     nicheCompetitors.length <= 30 ? 'Alta' : 'Muito Alta'}
                  </div>
                </div>
              </div>
            )}

            {isEnterprise && nicheCompetitors.length > 0 ? (
              <div className="space-y-1">
                {nicheCompetitors.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-2 border-b border-border/50 last:border-0">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">{(c.razao_social as string) || 'N/I'}</span>
                      <FraudAlertBadges tenderId={tender?.id as string || id} cnpj={(c.cnpj as string) || ''} />
                    </div>
                    <span className="text-muted-foreground shrink-0 ml-2 font-mono tabular-nums text-[11px]">
                      {Number(c.total_participacoes || 0) >= 5
                        ? `WR ${Math.round(Number(c.win_rate || 0) * 100)}%`
                        : <span className="opacity-60">{Number(c.total_vitorias || 0)}/{Number(c.total_participacoes || 0)} part.</span>
                      }
                      {' · '}{(c.porte as string) || 'N/I'}
                    </span>
                  </div>
                ))}
              </div>
            ) : nicheCompetitors.length > 0 ? (
              <p className="text-xs text-muted-foreground">{nicheCompetitors.length} concorrentes no nicho. <span className="text-blue-400">Nomes no plano Enterprise</span></p>
            ) : (
              <p className="text-xs text-muted-foreground">Sem dados competitivos para esta licitação.</p>
            )}
          </div>

          {/* Pricing Intelligence (Enterprise) */}
          {isEnterprise ? (
            <div className="card-refined">
              <div className="card-refined-header">
                <div className="flex items-center gap-2.5">
                  <div className="card-refined-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 6l-9.5 9.5-5-5L1 18" /><path d="M17 6h6v6" /></svg>
                  </div>
                  <h3 className="card-refined-title">Inteligência de Precificação</h3>
                </div>
              </div>
              <TenderPricing
                objeto={(tender?.objeto as string) || ''}
                valorEstimado={(tender?.valor_estimado as number) || null}
                uf={(tender?.uf as string) || null}
                modalidade={(tender?.modalidade_nome as string) || null}
              />
              <div className="mt-4">
                <HistoricalPrices
                  currentObjeto={(tender?.objeto as string) || ''}
                  currentValorEstimado={(tender?.valor_estimado as number) || null}
                  currentTenderId={(tender?.id as string) || id}
                />
              </div>
              {tender?.valor_estimado && (
                <div className="mt-4">
                  <LanceSimulator matchId={id} tenderId={tender.id as string} valorEstimado={Number(tender.valor_estimado)} />
                </div>
              )}
            </div>
          ) : (
            <div className="card-refined relative overflow-hidden">
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6 text-center">
                <h3 className="text-foreground font-semibold mb-1">Inteligência de Precificação</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">Análise comparativa, histórico e simulador de lances.</p>
                <Link href="/settings?tab=billing&upgrade=enterprise&source=pricing_intelligence" className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg transition-colors">
                  Disponível no Enterprise &rarr;
                </Link>
              </div>
              <div className="filter blur-sm pointer-events-none p-6">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-background rounded-lg p-3"><div className="h-4 bg-foreground/5 rounded w-20 mb-2" /><div className="h-6 bg-foreground/5 rounded w-24" /></div>
                  <div className="bg-background rounded-lg p-3"><div className="h-4 bg-foreground/5 rounded w-20 mb-2" /><div className="h-6 bg-foreground/5 rounded w-24" /></div>
                  <div className="bg-background rounded-lg p-3"><div className="h-4 bg-foreground/5 rounded w-20 mb-2" /><div className="h-6 bg-foreground/5 rounded w-24" /></div>
                </div>
              </div>
            </div>
          )}

          {/* Tools Grid 2x2 */}
          <div>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-3 px-1">Ferramentas</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Risk Analysis */}
              <div className="opp-tool-card">
                <div className="opp-tool-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-semibold text-foreground">Análise de Risco</h4>
                  <p className="text-[11px] text-muted-foreground">Detecção de anomalias e alertas</p>
                </div>
              </div>

              {/* Habilitação */}
              <div className="opp-tool-card">
                <div className="opp-tool-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-semibold text-foreground">Habilitação</h4>
                  <p className="text-[11px] text-muted-foreground">Checklist documental</p>
                </div>
                {isEnterprise && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">IA</span>}
              </div>

              {/* Impugnação */}
              <div className="opp-tool-card">
                <div className="opp-tool-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-semibold text-foreground">Impugnação</h4>
                  <p className="text-[11px] text-muted-foreground">Peça jurídica fundamentada</p>
                </div>
                {isEnterprise && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">IA</span>}
              </div>

              {/* Documents */}
              <div className="opp-tool-card">
                <div className="opp-tool-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-semibold text-foreground">Documentos</h4>
                  <p className="text-[11px] text-muted-foreground">{documents.length} arquivo{documents.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Expanded tool sections (rendered below the grid) */}
          <RiskAnalysisCard tenderId={tender?.id as string || id} hasAccess={isEnterprise} />
          {isEnterprise && <HabilitacaoChecklist matchId={id} />}
          {isEnterprise && <ImpugnationCard matchId={id} dataAbertura={tender?.data_abertura as string || null} />}

          {/* Requirements */}
          {requisitos && (requisitos as Record<string, any>).requisitos && (
            <div className="card-refined">
              <div className="card-refined-header">
                <div className="flex items-center gap-2.5">
                  <div className="card-refined-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h7" /></svg>
                  </div>
                  <h3 className="card-refined-title">Requisitos Extraídos</h3>
                </div>
              </div>
              <div className="space-y-2">
                {((requisitos as Record<string, any>).requisitos as Array<{ categoria: string; descricao: string; obrigatorio: boolean }>).map((req, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-background rounded-lg">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border shrink-0 h-fit ${
                      req.obrigatorio ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-foreground/5 text-muted-foreground border-border'
                    }`}>
                      {req.obrigatorio ? 'Obrigatório' : 'Desejável'}
                    </span>
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{req.categoria}</p>
                      <p className="text-sm text-foreground">{req.descricao}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compliance Checker */}
          {companyId && requisitos && (requisitos as Record<string, any>).requisitos && (
            <ComplianceChecker
              companyId={companyId}
              hasAccess={hasComplianceChecker}
              requisitos={((requisitos as Record<string, any>).requisitos as Array<{ categoria: string; descricao: string; obrigatorio: boolean }>) || []}
            />
          )}

          {/* Documents list */}
          {documents.length > 0 && (
            <div className="card-refined">
              <div className="card-refined-header">
                <div className="flex items-center gap-2.5">
                  <div className="card-refined-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
                  </div>
                  <h3 className="card-refined-title">Documentos do Edital</h3>
                </div>
              </div>
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-background rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.titulo || 'Documento sem título'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {doc.tipo && <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded">{doc.tipo}</span>}
                        {doc.status === 'error' ? <AnalyzeWithAIButton /> : (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${doc.status === 'done' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-foreground/5 text-muted-foreground'}`}>
                            {doc.status === 'done' ? 'Extraído' : 'Pendente'}
                          </span>
                        )}
                      </div>
                    </div>
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="shrink-0 ml-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      Download &rarr;
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* ── SIDEBAR ── */}
        <aside className="opp-sidebar">
          {/* Status & Actions */}
          <div className="card-refined-compact">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-3">Status Atual</span>
            <StatusChanger matchId={match.id} currentStatus={match.status} />
            <div className="mt-3 space-y-2">
              <Link
                href={`/proposals/generate/${match.id}`}
                className="block w-full text-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-opacity hover:opacity-90"
              >
                Gerar Proposta
              </Link>
              {isEnterprise ? (
                <Link
                  href={`/price-history?q=${encodeURIComponent((tender?.objeto as string) || '')}`}
                  className="block w-full text-center px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-xs font-medium transition-colors hover:bg-secondary/80"
                >
                  Preços de Mercado
                </Link>
              ) : (
                <Link
                  href="/settings?tab=billing&upgrade=enterprise&source=market_prices"
                  className="block w-full text-center px-3 py-2 rounded-lg bg-secondary border border-border text-muted-foreground text-xs font-medium transition-colors hover:bg-secondary/80"
                >
                  Preços de Mercado (Enterprise)
                </Link>
              )}
            </div>
            {recomendacao && (
              <div className="mt-3 pt-3 border-t border-border">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">Recomendação IA</span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                  recomendacao === 'participar' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  recomendacao === 'avaliar_melhor' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                  'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    recomendacao === 'participar' ? 'bg-emerald-400' : recomendacao === 'avaliar_melhor' ? 'bg-amber-400' : 'bg-red-400'
                  }`} />
                  {recomendacao === 'participar' ? 'Participar' : recomendacao === 'avaliar_melhor' ? 'Avaliar Melhor' : 'Não Recomendado'}
                </span>
              </div>
            )}
          </div>

          {/* Deadline Countdown */}
          <div className="card-refined-compact">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">Prazo de Encerramento</span>
            {dl ? (
              <>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`font-mono tabular-nums text-5xl font-bold leading-none tracking-tighter ${dl.past ? 'text-red-400' : dl.urgent ? 'text-red-400' : 'text-foreground'}`}>
                    {dl.days}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground pb-1">
                    {dl.past ? 'dias atrás' : 'dias restantes'}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground mb-3">
                  {formatDate(tender.data_encerramento as string)}
                </p>
                <div className="h-[3px] bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${dlProgress}%`,
                      background: dlProgress > 80 ? '#EF4444' : dlProgress > 50 ? '#F59E0B' : '#10B981',
                    }}
                  />
                </div>
              </>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Verificar prazo
              </span>
            )}
          </div>

          {/* Metadata */}
          <div className="card-refined-compact">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-3">Informações</span>
            <dl className="space-y-2.5">
              {[
                { label: 'CNPJ Órgão', value: (tender?.orgao_cnpj as string) || '-', mono: true },
                { label: 'Modalidade', value: (tender?.modalidade_nome as string) || '-' },
                { label: 'Valor Estimado', value: tender?.valor_estimado ? formatCurrency(tender.valor_estimado as number) : 'Não informado', mono: true },
                { label: 'Valor Homologado', value: tender?.valor_homologado ? formatCurrency(tender.valor_homologado as number) : '-', mono: true },
                { label: 'Publicação', value: tender?.data_publicacao ? formatDate(tender.data_publicacao as string) : '-' },
                { label: 'Abertura', value: tender?.data_abertura ? formatDate(tender.data_abertura as string) : '-' },
                { label: 'Situação', value: (tender?.situacao_nome as string) || '-' },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between items-center gap-3">
                  <dt className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</dt>
                  <dd className={`text-[12px] font-medium text-foreground text-right ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* External Links */}
          {(linkPncp || externalUrl) && (
            <div className="card-refined-compact">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-3">Links Externos</span>
              <div className="space-y-2">
                {linkPncp && (
                  <a href={linkPncp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                    Ver no PNCP <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
                  </a>
                )}
                {externalUrl && (
                  <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                    Sistema de Origem <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          <div className="card-refined-compact">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-3">Atividade</span>
            <ol className="opp-timeline">
              <li className="opp-timeline-item">
                <div className="opp-timeline-dot opp-timeline-dot-brand" />
                <div>
                  <span className="text-[12px] font-medium text-foreground">IA notificou oportunidade</span>
                  <span className="text-[11px] text-muted-foreground block">Score {match.score} · {matchSource === 'ai' || matchSource === 'ai_triage' ? 'Verificado por IA' : 'Estimado'}</span>
                </div>
              </li>
              {!!(tender?.data_publicacao) && (
                <li className="opp-timeline-item">
                  <div className="opp-timeline-dot" />
                  <div>
                    <span className="text-[12px] font-medium text-foreground">Edital publicado</span>
                    <span className="text-[11px] text-muted-foreground block">{formatDate(tender.data_publicacao as string)}</span>
                  </div>
                </li>
              )}
            </ol>
          </div>
        </aside>
      </div>
    </div>
    </ScoreProvider>
  )
}
