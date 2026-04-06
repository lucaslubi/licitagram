'use client'

import Link from 'next/link'
import { formatCompactBRL } from '@/lib/geo/map-utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OverviewData {
  // Aggregated position
  totalCompetitors: number
  directCompetitors: number
  indirectCompetitors: number
  potentialPartners: number
  avgRelevanceScore: number

  // Top rivals
  topRivals: Array<{
    cnpj: string
    name: string
    participations: number
    wins: number
    winRate: number
    totalValue: number
    porte: string | null
    uf: string | null
    threatLevel: string | null
    ufs: string[]
  }>

  // UF heatmap data
  ufHeatmap: Array<{
    uf: string
    editalCount: number
    competitorCount: number
    avgWinRate: number
    opportunityScore: number
  }>

  // Watched count
  watchedCount: number

  // Fallback for when AI classification hasn't run
  porteDistribution: Array<{ porte: string; count: number }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function threatBadge(level: string | null) {
  if (level === 'alto') return { label: 'Alto', cls: 'bg-red-500/10 text-red-400 border-red-500/20' }
  if (level === 'medio') return { label: 'Médio', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
  return { label: 'Baixo', cls: 'bg-foreground/5 text-muted-foreground border-border' }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function IntelOverview({ data }: { data: OverviewData }) {
  const hasSignificantData = data.totalCompetitors >= 3
  const hasRivals = data.topRivals.length > 0
  const hasUfData = data.ufHeatmap.length > 0
  // Find best UF with meaningful data (at least 3 editais)
  const bestUf = data.ufHeatmap.find(uf => uf.editalCount >= 3) || data.ufHeatmap[0]

  return (
    <div className="space-y-5">

      {/* ━━━ STRATEGIC INSIGHTS ROW ━━━ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Insight 1: Opportunity */}
        {hasUfData && bestUf ? (
          <div className="intel-insight-card intel-insight-opportunity">
            <div className="intel-insight-icon intel-insight-icon-opportunity">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
            </div>
            <p className="intel-insight-label">Oportunidade de Arbitragem</p>
            <p className="intel-insight-headline">{bestUf.uf} — {bestUf.competitorCount} concorrente{bestUf.competitorCount !== 1 ? 's' : ''}, {bestUf.editalCount} participações</p>
            <p className="intel-insight-detail">
              Score de oportunidade {bestUf.opportunityScore}/100. Win rate médio {bestUf.avgWinRate.toFixed(1)}%.
            </p>
            <Link href={`/opportunities?uf=${bestUf.uf}&view=matches`} className="intel-insight-action">
              Ver editais de {bestUf.uf} &rarr;
            </Link>
          </div>
        ) : (
          <div className="intel-insight-card">
            <div className="intel-insight-icon" style={{ background: 'hsl(240 4% 12%)', border: '1px solid hsl(240 4% 16%)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
            </div>
            <p className="intel-insight-label">Oportunidades Geográficas</p>
            <p className="intel-insight-headline">Dados sendo coletados</p>
            <p className="intel-insight-detail">Análise geográfica requer pelo menos 90 dias de histórico no seu nicho.</p>
          </div>
        )}

        {/* Insight 2: Top threat */}
        {hasRivals ? (() => {
          const threat = data.topRivals[0]
          return (
            <div className="intel-insight-card intel-insight-threat">
              <div className="intel-insight-icon intel-insight-icon-threat">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /></svg>
              </div>
              <p className="intel-insight-label">Principal Rival</p>
              <p className="intel-insight-headline">{threat.name?.slice(0, 40) || 'N/I'}</p>
              <p className="intel-insight-detail">
                Win rate {threat.winRate.toFixed(1)}% com {threat.participations} participações. Valor: {formatCompactBRL(threat.totalValue)}.
              </p>
              <Link href="/competitors?tab=ranking" className="intel-insight-action">
                Ver ranking completo &rarr;
              </Link>
            </div>
          )
        })() : (
          <div className="intel-insight-card">
            <div className="intel-insight-icon" style={{ background: 'hsl(240 4% 12%)', border: '1px solid hsl(240 4% 16%)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
            </div>
            <p className="intel-insight-label">Rivais</p>
            <p className="intel-insight-headline">Identificando concorrentes</p>
            <p className="intel-insight-detail">A análise de rivais aparecerá aqui quando houver dados suficientes.</p>
          </div>
        )}

        {/* Insight 3: Market summary */}
        <div className="intel-insight-card intel-insight-neutral">
          <div className="intel-insight-icon intel-insight-icon-neutral">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 6l-9.5 9.5-5-5L1 18" /><path d="M17 6h6v6" /></svg>
          </div>
          <p className="intel-insight-label">Visão de Mercado</p>
          <p className="intel-insight-headline">{data.totalCompetitors} concorrentes ativos no nicho</p>
          <p className="intel-insight-detail">
            {data.directCompetitors} diretos, {data.indirectCompetitors} indiretos, {data.potentialPartners} potenciais parceiros.
            {data.watchedCount > 0 && ` ${data.watchedCount} monitorados.`}
          </p>
          <Link href="/competitors?tab=mercado" className="intel-insight-action">
            Explorar mercado &rarr;
          </Link>
        </div>
      </div>

      {/* ━━━ COMPETITIVE POSITION ━━━ */}
      {(data.directCompetitors > 0 || data.indirectCompetitors > 0 || data.avgRelevanceScore > 0) ? (
        <div className="card-refined">
          <div className="card-refined-header">
            <div className="flex items-center gap-2.5">
              <div className="card-refined-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 20V4M6 20v-4" /></svg>
              </div>
              <div>
                <h3 className="card-refined-title">Posição Competitiva</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Baseado em {data.totalCompetitors} concorrentes ativos</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border">
            <div className="bg-card p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">Concorrentes Diretos</p>
              <p className="text-2xl font-bold text-foreground font-mono tabular-nums tracking-tight">{data.directCompetitors}</p>
              <p className="text-[11px] text-muted-foreground mt-1">de {data.totalCompetitors} no nicho</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">Concorrentes Indiretos</p>
              <p className="text-2xl font-bold text-foreground font-mono tabular-nums tracking-tight">{data.indirectCompetitors}</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">Potenciais Parceiros</p>
              <p className="text-2xl font-bold text-foreground font-mono tabular-nums tracking-tight">{data.potentialPartners}</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">Score Relevância Médio</p>
              <p className="text-2xl font-bold text-foreground font-mono tabular-nums tracking-tight">{data.avgRelevanceScore}</p>
              <p className="text-[11px] text-muted-foreground mt-1">de 100</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card-refined">
          <div className="card-refined-header">
            <div className="flex items-center gap-2.5">
              <div className="card-refined-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 20V4M6 20v-4" /></svg>
              </div>
              <div>
                <h3 className="card-refined-title">Posição Competitiva</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Classificação de concorrentes pendente</p>
              </div>
            </div>
          </div>
          {data.porteDistribution.length > 0 ? (
            <div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border mb-3">
                {data.porteDistribution.slice(0, 4).map((p) => (
                  <div key={p.porte} className="bg-card p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">{p.porte || 'Outros'}</p>
                    <p className="text-2xl font-bold text-foreground font-mono tabular-nums tracking-tight">{p.count}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/60 text-center">Distribuição por porte — classificação detalhada (direto/indireto/parceiro) será gerada pela IA.</p>
            </div>
          ) : (
            <div className="bg-background rounded-lg p-6 text-center">
              <p className="text-sm text-muted-foreground mb-1">{data.totalCompetitors} concorrentes identificados no nicho</p>
              <p className="text-xs text-muted-foreground/60">A classificação será gerada automaticamente.</p>
            </div>
          )}
        </div>
      )}

      {/* ━━━ TWO COLUMNS: HEATMAP + TOP RIVALS ━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Opportunity Heatmap by UF */}
        <div className="card-refined">
          <div className="card-refined-header">
            <div className="flex items-center gap-2.5">
              <div className="card-refined-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
              </div>
              <div>
                <h3 className="card-refined-title">Oportunidades por UF</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Participações × concorrentes = oportunidade</p>
              </div>
            </div>
          </div>
          {data.ufHeatmap.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados geográficos disponíveis</p>
          ) : (
            <div className="space-y-1">
              {data.ufHeatmap.slice(0, 10).map((uf, idx) => (
                <div key={uf.uf} className="flex items-center gap-3 py-2 px-1 rounded-md hover:bg-secondary/50 transition-colors">
                  <span className="text-[10px] font-bold font-mono tabular-nums text-muted-foreground w-5 text-right">{idx + 1}</span>
                  <span className="w-7 h-5 rounded bg-secondary border border-border flex items-center justify-center text-[10px] font-bold text-foreground">{uf.uf}</span>
                  <div className="flex-1 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted-foreground">Part. </span>
                      <span className="font-semibold text-foreground font-mono tabular-nums">{uf.editalCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Concorr. </span>
                      <span className="font-semibold text-foreground font-mono tabular-nums">{uf.competitorCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">WR </span>
                      <span className="font-semibold text-foreground font-mono tabular-nums">{Math.round(uf.avgWinRate)}%</span>
                    </div>
                  </div>
                  <div className="w-20 flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-foreground/30" style={{ width: `${uf.opportunityScore}%` }} />
                    </div>
                    <span className="text-[10px] font-bold font-mono tabular-nums text-foreground w-5 text-right">{uf.opportunityScore}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Rivals */}
        <div className="card-refined">
          <div className="card-refined-header">
            <div className="flex items-center gap-2.5">
              <div className="card-refined-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
              </div>
              <div>
                <h3 className="card-refined-title">Top Rivais</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Maiores concorrentes por volume</p>
              </div>
            </div>
            <Link href="/competitors?tab=ranking" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              Ver todos &rarr;
            </Link>
          </div>
          {data.topRivals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados de concorrentes disponíveis</p>
          ) : (
            <div className="space-y-1">
              {data.topRivals.slice(0, 7).map((rival, idx) => {
                const tb = threatBadge(rival.threatLevel)
                return (
                  <div key={rival.cnpj} className="flex items-center gap-3 py-2.5 px-1 rounded-md hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-0">
                    <span className="text-[10px] font-bold font-mono tabular-nums text-muted-foreground w-4">{idx + 1}</span>
                    <div className="w-7 h-7 rounded-md bg-secondary border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">
                      {(rival.name || '?')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground truncate">{rival.name || 'N/I'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">{rival.participations} part.</span>
                        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">WR {rival.winRate.toFixed(1)}%</span>
                        {rival.porte && <span className="text-[10px] text-muted-foreground">{rival.porte}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] font-semibold text-foreground font-mono tabular-nums">{formatCompactBRL(rival.totalValue)}</span>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${tb.cls}`}>{tb.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
