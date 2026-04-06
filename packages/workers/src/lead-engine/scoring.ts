/**
 * Lead Engine — Fórmula de Scoring Proprietário Licitagram
 *
 * Calcula score_fit_licitagram (0–100) baseado em:
 *   1. Atividade Recente (30 pts)
 *   2. Volume de Participação (20 pts)
 *   3. Ticket Médio de Contratos (20 pts)
 *   4. Dor de Perda (15 pts)
 *   5. Diversidade de Órgãos (10 pts)
 *   6. Compliance (5 pts)
 *
 * Desqualificadores automáticos (score = 0 + bloqueio):
 *   - Sancionado em CEIS/CNEP/CEPIM
 *   - Já é cliente Licitagram
 *   - Situação cadastral != Ativa
 */

export interface LeadScoringInput {
  // Atividade
  diasDesdeUltimaParticipacao: number | null
  // Volume
  totalLicitacoes12m: number
  // Ticket
  ticketMedioContratos: number
  // Dor de perda
  licitacoesPerdidasPorPouco12m: number
  // Diversidade
  orgaosDistintos12m: number
  // Compliance
  statusCeis: boolean
  statusCnep: boolean
  statusCepim: boolean
  // Desqualificadores
  jaEClienteLicitagram: boolean
  situacaoCadastral: string | null
  optOut: boolean
}

export interface LeadScoringResult {
  score: number
  planoRecomendado: 'ESSENCIAL' | 'PROFISSIONAL' | 'ENTERPRISE'
  prioridadeOutreach: 'HOT' | 'WARM' | 'COLD' | 'NAO_DISPARAR'
  bloqueadoDisparo: boolean
  motivoBloqueio: string | null
  breakdown: {
    atividadeRecente: number
    volumeParticipacao: number
    ticketMedio: number
    dorDePerda: number
    diversidadeOrgaos: number
    compliance: number
  }
}

export function calcularScoreLead(input: LeadScoringInput): LeadScoringResult {
  // ─── Desqualificadores ────────────────────────────────────
  if (input.jaEClienteLicitagram) {
    return disqualified(0, 'Já é cliente Licitagram')
  }

  const sitAtiva = !input.situacaoCadastral
    || input.situacaoCadastral.toLowerCase().includes('ativa')
    || input.situacaoCadastral === '02' // código RFB para Ativa
  if (!sitAtiva) {
    return disqualified(0, `Situação cadastral: ${input.situacaoCadastral}`)
  }

  if (input.statusCeis || input.statusCnep || input.statusCepim) {
    const listas: string[] = []
    if (input.statusCeis) listas.push('CEIS')
    if (input.statusCnep) listas.push('CNEP')
    if (input.statusCepim) listas.push('CEPIM')
    return disqualified(0, `Presença em lista de sanções: ${listas.join(', ')}`)
  }

  // ─── 1. Atividade Recente (30 pts) ────────────────────────
  let atividadeRecente = 0
  const dias = input.diasDesdeUltimaParticipacao
  if (dias !== null && dias >= 0) {
    if (dias <= 30) atividadeRecente = 30
    else if (dias <= 90) atividadeRecente = 20
    else if (dias <= 180) atividadeRecente = 10
    else if (dias <= 365) atividadeRecente = 5
  }

  // ─── 2. Volume de Participação (20 pts) ───────────────────
  let volumeParticipacao = 0
  const total12m = input.totalLicitacoes12m
  if (total12m >= 50) volumeParticipacao = 20
  else if (total12m >= 20) volumeParticipacao = 15
  else if (total12m >= 10) volumeParticipacao = 10
  else if (total12m >= 5) volumeParticipacao = 5
  else if (total12m >= 1) volumeParticipacao = 2

  // ─── 3. Ticket Médio (20 pts) → define plano ─────────────
  let ticketMedio = 0
  let planoRecomendado: 'ESSENCIAL' | 'PROFISSIONAL' | 'ENTERPRISE' = 'ESSENCIAL'
  const ticket = input.ticketMedioContratos
  if (ticket > 500_000) {
    ticketMedio = 20
    planoRecomendado = 'ENTERPRISE'
  } else if (ticket >= 100_000) {
    ticketMedio = 15
    planoRecomendado = 'PROFISSIONAL'
  } else if (ticket >= 20_000) {
    ticketMedio = 10
    planoRecomendado = 'PROFISSIONAL'
  } else if (ticket > 0) {
    ticketMedio = 5
    planoRecomendado = 'ESSENCIAL'
  }

  // ─── 4. Dor de Perda (15 pts) ────────────────────────────
  let dorDePerda = 0
  const perdas = input.licitacoesPerdidasPorPouco12m
  if (perdas >= 5) dorDePerda = 15
  else if (perdas >= 2) dorDePerda = 10
  else if (perdas >= 1) dorDePerda = 5

  // ─── 5. Diversidade de Órgãos (10 pts) ───────────────────
  let diversidadeOrgaos = 0
  const orgaos = input.orgaosDistintos12m
  if (orgaos >= 10) diversidadeOrgaos = 10
  else if (orgaos >= 5) diversidadeOrgaos = 7
  else if (orgaos >= 2) diversidadeOrgaos = 4
  else if (orgaos >= 1) diversidadeOrgaos = 1

  // ─── 6. Compliance (5 pts) — já verificado acima, se aqui = limpo
  const compliance = 5

  // ─── Total ────────────────────────────────────────────────
  const score = Math.min(100, atividadeRecente + volumeParticipacao + ticketMedio + dorDePerda + diversidadeOrgaos + compliance)

  // ─── Prioridade ───────────────────────────────────────────
  let prioridadeOutreach: 'HOT' | 'WARM' | 'COLD' | 'NAO_DISPARAR'
  if (score >= 80) prioridadeOutreach = 'HOT'
  else if (score >= 50) prioridadeOutreach = 'WARM'
  else if (score >= 20) prioridadeOutreach = 'COLD'
  else prioridadeOutreach = 'NAO_DISPARAR'

  return {
    score,
    planoRecomendado,
    prioridadeOutreach,
    bloqueadoDisparo: input.optOut || prioridadeOutreach === 'NAO_DISPARAR',
    motivoBloqueio: input.optOut ? 'Opt-out LGPD' : prioridadeOutreach === 'NAO_DISPARAR' ? 'Score < 20' : null,
    breakdown: {
      atividadeRecente,
      volumeParticipacao,
      ticketMedio,
      dorDePerda,
      diversidadeOrgaos,
      compliance,
    },
  }
}

function disqualified(score: number, motivo: string): LeadScoringResult {
  return {
    score,
    planoRecomendado: 'ESSENCIAL',
    prioridadeOutreach: 'NAO_DISPARAR',
    bloqueadoDisparo: true,
    motivoBloqueio: motivo,
    breakdown: {
      atividadeRecente: 0,
      volumeParticipacao: 0,
      ticketMedio: 0,
      dorDePerda: 0,
      diversidadeOrgaos: 0,
      compliance: 0,
    },
  }
}

/**
 * Gera motivo_qualificacao em português a partir dos dados reais do lead.
 */
export function gerarMotivoQualificacao(data: {
  razaoSocial: string
  totalParticipacoes12m: number
  totalVitorias12m: number
  ticketMedio: number
  orgaoTop: string | null
  perdasPorPouco: number
  margemMediaPerda: number | null
  score: number
  plano: string
  estaLimpo: boolean
}): string {
  const parts: string[] = []

  // Participação
  if (data.totalParticipacoes12m > 0) {
    parts.push(`Empresa participou de ${data.totalParticipacoes12m} licitações nos últimos 12 meses`)
    if (data.orgaoTop) {
      parts[parts.length - 1] += ` (incluindo ${data.orgaoTop})`
    }
  }

  // Vitórias
  if (data.totalVitorias12m > 0) {
    const ticketFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(data.ticketMedio)
    parts.push(`ganhou ${data.totalVitorias12m} contratos com ticket médio de ${ticketFmt}`)
  }

  // Perdas por pouco (gatilho de dor)
  if (data.perdasPorPouco > 0) {
    const margem = data.margemMediaPerda != null ? `${data.margemMediaPerda.toFixed(1)}%` : '5%'
    parts.push(`e perdeu ${data.perdasPorPouco} por margem inferior a ${margem}`)
  }

  // Compliance
  if (data.estaLimpo) {
    parts.push('Limpa em todas as listas de sanções')
  }

  // Plano
  parts.push(`Plano recomendado: ${data.plano}`)

  // Join
  let text = parts.join(', ')
  // Capitalize first letter after join
  text = text.charAt(0).toUpperCase() + text.slice(1)
  if (!text.endsWith('.')) text += '.'

  return text
}

/**
 * Regex para validação de email institucional genérico.
 * APENAS aceita prefixos genéricos — NUNCA nominais.
 */
export const EMAIL_GENERICO_REGEX = /^(contato|comercial|vendas|licitacoes|licitacao|atendimento|sac|suporte|financeiro|adm|administrativo|faleconosco|info)@/i

/**
 * Verifica se um email é institucional genérico (seguro para outbound B2B).
 * Retorna o email limpo se válido, null se não.
 */
export function filtrarEmailGenerico(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null
  const cleaned = email.trim().toLowerCase()
  if (!cleaned || !cleaned.includes('@')) return null
  if (EMAIL_GENERICO_REGEX.test(cleaned)) return cleaned
  return null
}

/**
 * Mapper de porte RFB para enum.
 */
export function mapPorteRfb(porteRfb: string | null | undefined): 'MEI' | 'ME' | 'EPP' | 'DEMAIS' {
  if (!porteRfb) return 'DEMAIS'
  const p = porteRfb.toUpperCase()
  if (p.includes('MEI') || p.includes('MICROEMPREENDEDOR INDIVIDUAL')) return 'MEI'
  if (p.includes('MICROEMPRESA') || p.includes('MICRO EMPRESA')) return 'ME'
  if (p.includes('PEQUENO PORTE') || p.includes('EPP')) return 'EPP'
  return 'DEMAIS'
}
