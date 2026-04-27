import { Check, X } from 'lucide-react'

interface MatchExplanationProps {
  match: {
    score?: number | null
    score_final?: number | null
    score_by_pgvector?: number | null
    score_by_keyword?: number | null
    score_semantic?: number | null
    score_cnae?: number | null
    score_keyword?: number | null
    score_valor?: number | null
    score_uf?: number | null
    score_modalidade?: number | null
    breakdown?: Record<string, any> | null
    match_source?: string | null
    match_source_primary?: string | null
    recomendacao?: string | null
  }
  tender: {
    uf?: string | null
    valor_estimado?: number | null
    modalidade_nome?: string | null
  }
  company?: {
    palavras_chave?: string[] | null
    cnae_principal?: string | null
    cnaes_secundarios?: string[] | null
    ufs_interesse?: string[] | null
    min_valor?: number | null
    max_valor?: number | null
  } | null
  /** Compact mode: render top 3 reasons only, no header/recomendacao block */
  compact?: boolean
}

function pct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${Math.round((v as number) * 100)}%`
}

function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function MatchExplanation({ match, tender, company, compact = false }: MatchExplanationProps) {
  const reasons: Array<{ ok: boolean; label: string; detail?: string }> = []

  // Aderência semântica detectada pela IA
  if (match.score_semantic != null) {
    const v = match.score_semantic as number
    reasons.push({
      ok: v >= 0.4,
      label: 'IA detectou aderência ao seu negócio',
      detail: pct(v),
    })
  }

  // CNAE compatibility
  if (match.score_cnae != null) {
    const v = match.score_cnae as number
    reasons.push({
      ok: v >= 0.5,
      label: 'CNAE compatível',
      detail: pct(v),
    })
  }

  // Termos do seu perfil casaram com o objeto da licitação
  if (match.score_by_keyword != null && (match.score_by_keyword as number) > 0) {
    reasons.push({
      ok: true,
      label: 'Termos do seu perfil casaram',
      detail: `${match.score_by_keyword}/100`,
    })
  } else if (match.score_keyword != null) {
    const v = match.score_keyword as number
    reasons.push({
      ok: v >= 0.4,
      label: 'Termos do seu perfil',
      detail: pct(v),
    })
  }

  // UF on interest list
  if (tender.uf && company?.ufs_interesse && company.ufs_interesse.length > 0) {
    const ok = company.ufs_interesse.includes(tender.uf)
    reasons.push({
      ok,
      label: `UF ${tender.uf}`,
      detail: ok ? 'na sua lista de interesse' : 'fora da sua lista',
    })
  } else if (tender.uf) {
    reasons.push({ ok: true, label: `UF ${tender.uf}` })
  }

  // Value within range
  if (tender.valor_estimado != null) {
    const valor = Number(tender.valor_estimado)
    const min = company?.min_valor
    const max = company?.max_valor
    let ok = true
    let detail = `R$ ${fmtBRL(valor)}`
    if (min != null && valor < min) {
      ok = false
      detail += ` (abaixo do mínimo R$ ${fmtBRL(min)})`
    } else if (max != null && valor > max) {
      ok = false
      detail += ` (acima do máximo R$ ${fmtBRL(max)})`
    } else if (min != null || max != null) {
      detail += ' (dentro da sua faixa)'
    }
    reasons.push({ ok, label: 'Valor', detail })
  }

  // Modalidade competitiveness
  if (tender.modalidade_nome) {
    const competitive = !['Inexigibilidade', 'Credenciamento', 'Dispensa'].includes(tender.modalidade_nome)
    reasons.push({
      ok: competitive,
      label: `Modalidade: ${tender.modalidade_nome}`,
      detail: competitive ? 'competitiva' : 'não-competitiva',
    })
  }

  // Narrativa cliente: SEMPRE "Inteligência Artificial Licitagram".
  // Cliente não precisa saber qual engine interno casou — pra ele é A NOSSA IA.
  const engine = 'Inteligência Artificial Licitagram'

  const visibleReasons = compact ? reasons.slice(0, 3) : reasons
  const finalScore = match.score_final ?? match.score ?? null

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Por que esse match{finalScore != null ? ` (score ${finalScore})` : ''}</span>
          <span className="text-[10px] inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
            <span>✨</span> via {engine}
          </span>
        </div>
      )}
      <ul className="space-y-1.5">
        {visibleReasons.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px]">
            {r.ok ? (
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
            ) : (
              <X className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-500" />
            )}
            <div>
              <span className="font-medium text-foreground">{r.label}</span>
              {r.detail && <span className="text-muted-foreground ml-1">— {r.detail}</span>}
            </div>
          </li>
        ))}
      </ul>
      {!compact && match.recomendacao && (
        <div className="mt-2 p-2 bg-blue-500/5 border border-blue-500/20 rounded text-[12px] text-blue-400">
          {match.recomendacao}
        </div>
      )}
    </div>
  )
}
