/**
 * F-Q5 — Fit/Risk flags
 *
 * Sinaliza riscos de um match pra cliente: CNDs faltando/vencidas, capital
 * social baixo vs valor estimado, e valor fora da faixa configurada.
 *
 * NÃO bloqueia notificação — apenas avisa. Cliente decide se quer participar.
 *
 * Fonte de dados de CNDs (best-effort, em ordem):
 *   1. Tabela `company_certidoes` (se existir)
 *   2. Último `certidao_jobs.result_json.certidoes` completo (fallback)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type FitFlag =
  | { kind: 'missing_cnd'; tipo: string; severity: 'high' | 'medium' }
  | { kind: 'expired_cnd'; tipo: string; valida_ate: string; severity: 'high' }
  | { kind: 'capital_low'; capital: number; valor_estimado: number; ratio: number; severity: 'medium' | 'high' }
  | { kind: 'value_above_max'; valor: number; max: number; severity: 'low' }
  | { kind: 'value_below_min'; valor: number; min: number; severity: 'low' }

export interface FitFlagsResult {
  flags: FitFlag[]
  fit_score: number // 0-100, 100 = sem flags
}

const TIPOS_REQUERIDOS_POR_DEFAULT = ['receita', 'fgts', 'tst']

// Normaliza tipos de CND vindos de fontes diferentes (worker, manual, etc)
function normalizeTipo(t: string | null | undefined): string {
  const s = String(t || '').toLowerCase()
  if (s.includes('cnd_federal') || s.includes('receita') || s.includes('pgfn') || s === 'federal') return 'receita'
  if (s.includes('fgts')) return 'fgts'
  if (s.includes('tst') || s.includes('cndt') || s.includes('trabalhist')) return 'tst'
  if (s.includes('estadual')) return 'estadual'
  if (s.includes('municipal')) return 'municipal'
  return s
}

interface CndRow {
  tipo: string
  valida_ate: string | null
  status: string | null
}

async function loadCnds(supabase: SupabaseClient, companyId: string): Promise<CndRow[]> {
  // 1. tenta tabela canônica company_certidoes
  try {
    const { data, error } = await supabase
      .from('company_certidoes')
      .select('tipo, valida_ate, status')
      .eq('company_id', companyId)
    if (!error && data && data.length > 0) {
      return (data as any[]).map((c) => ({
        tipo: normalizeTipo(c.tipo),
        valida_ate: c.valida_ate ?? null,
        status: c.status ?? null,
      }))
    }
  } catch {
    // tabela pode não existir — cai pro fallback
  }

  // 2. fallback: último certidao_jobs completed
  try {
    const { data: job } = await supabase
      .from('certidao_jobs')
      .select('result_json, status')
      .eq('company_id', companyId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const certs = (job as any)?.result_json?.certidoes
    if (Array.isArray(certs)) {
      return certs.map((c: any) => ({
        tipo: normalizeTipo(c.tipo),
        valida_ate: c.validade ?? null,
        status: c.situacao ?? null,
      }))
    }
  } catch {
    // ignore
  }

  return []
}

export async function computeFitFlags(
  supabase: SupabaseClient,
  companyId: string,
  match: {
    valor_estimado?: number | null
    requisitos?: any
  },
  companyMeta: {
    capital_social?: number | null
    min_valor?: number | null
    max_valor?: number | null
  },
): Promise<FitFlagsResult> {
  const flags: FitFlag[] = []

  const cnds = await loadCnds(supabase, companyId)

  const today = new Date().toISOString().split('T')[0]
  const cndMap = new Map<string, CndRow>()
  for (const c of cnds) cndMap.set(c.tipo, c)

  // Tipos requeridos: pode vir do tender.requisitos ou usar default
  const reqList = match.requisitos?.cnds
  const tiposReq: string[] =
    Array.isArray(reqList) && reqList.length > 0
      ? reqList.map((t: string) => normalizeTipo(t))
      : TIPOS_REQUERIDOS_POR_DEFAULT

  for (const tipo of tiposReq) {
    const c = cndMap.get(tipo)
    if (!c) {
      flags.push({ kind: 'missing_cnd', tipo, severity: 'high' })
      continue
    }
    // status irregular conta como expired/missing
    if (c.status && /irregular|vencid|expir/i.test(c.status)) {
      flags.push({ kind: 'expired_cnd', tipo, valida_ate: c.valida_ate || today, severity: 'high' })
      continue
    }
    if (c.valida_ate && c.valida_ate < today) {
      flags.push({ kind: 'expired_cnd', tipo, valida_ate: c.valida_ate, severity: 'high' })
    }
  }

  // Capital social vs valor estimado
  const valor = Number(match.valor_estimado || 0)
  const capital = Number(companyMeta.capital_social || 0)
  if (valor > 0 && capital > 0) {
    const ratio = capital / valor
    if (ratio < 0.05) {
      flags.push({ kind: 'capital_low', capital, valor_estimado: valor, ratio, severity: 'high' })
    } else if (ratio < 0.10) {
      flags.push({ kind: 'capital_low', capital, valor_estimado: valor, ratio, severity: 'medium' })
    }
  }

  // Faixa de valor da empresa (configurada em /conta/notif)
  if (valor > 0) {
    if (companyMeta.max_valor != null && valor > companyMeta.max_valor) {
      flags.push({ kind: 'value_above_max', valor, max: companyMeta.max_valor, severity: 'low' })
    }
    if (companyMeta.min_valor != null && valor < companyMeta.min_valor) {
      flags.push({ kind: 'value_below_min', valor, min: companyMeta.min_valor, severity: 'low' })
    }
  }

  // Fit score: começa em 100, desconta por flag
  let fit_score = 100
  for (const f of flags) {
    if (f.severity === 'high') fit_score -= 25
    else if (f.severity === 'medium') fit_score -= 10
    else fit_score -= 5
  }
  fit_score = Math.max(0, fit_score)

  return { flags, fit_score }
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString('pt-BR')
  } catch {
    return s
  }
}

function labelCnd(tipo: string): string {
  const map: Record<string, string> = {
    receita: 'da Receita Federal',
    fgts: 'do FGTS',
    tst: 'Trabalhista (TST)',
    pgfn: 'PGFN',
    estadual: 'Estadual',
    municipal: 'Municipal',
  }
  return map[tipo] || tipo
}

export function flagToMessage(f: FitFlag): string {
  switch (f.kind) {
    case 'missing_cnd':
      return `Você não tem CND ${labelCnd(f.tipo)} cadastrada`
    case 'expired_cnd':
      return `Sua CND ${labelCnd(f.tipo)} venceu em ${formatDate(f.valida_ate)}`
    case 'capital_low':
      return `Capital ${fmtBRL(f.capital)} é ${(f.ratio * 100).toFixed(1)}% do valor estimado (${fmtBRL(f.valor_estimado)})`
    case 'value_above_max':
      return `Valor ${fmtBRL(f.valor)} acima do seu máximo configurado (${fmtBRL(f.max)})`
    case 'value_below_min':
      return `Valor ${fmtBRL(f.valor)} abaixo do seu mínimo configurado (${fmtBRL(f.min)})`
  }
}

/**
 * Sumário compacto pra incluir em payload de notificação (email/whatsapp/telegram).
 * Não bloqueia envio — só sinaliza.
 */
export function summarizeFlags(flags: FitFlag[]): {
  high: number
  medium: number
  low: number
  total: number
  top?: string
} {
  let high = 0
  let medium = 0
  let low = 0
  for (const f of flags) {
    if (f.severity === 'high') high++
    else if (f.severity === 'medium') medium++
    else low++
  }
  const top = flags.find((f) => f.severity === 'high') ?? flags[0]
  return {
    high,
    medium,
    low,
    total: flags.length,
    top: top ? flagToMessage(top) : undefined,
  }
}
