/**
 * MiroFish Client — Bridge between Licitagram workers and MiroFish prediction engine
 *
 * MiroFish is a Python Flask service running on the same VPS (localhost:5001).
 * It builds knowledge graphs via Zep, simulates multi-agent interactions,
 * and produces prediction reports for fraud detection and price forecasting.
 *
 * This client:
 * - Formats Licitagram data into Markdown documents for MiroFish ingestion
 * - Manages the async analysis lifecycle (submit → poll → retrieve)
 * - Implements circuit breaker pattern (graceful degradation if MiroFish is down)
 * - Rate limits to control LLM costs
 * - Feature-flagged: does nothing if MIROFISH_ENABLED !== 'true'
 */

import { logger } from '../lib/logger'
import { localPool } from '../lib/local-db'

// ─── Config ─────────────────────────────────────────────────────────────────

const MIROFISH_URL = process.env.MIROFISH_URL || 'http://localhost:5001'
const MIROFISH_ENABLED = process.env.MIROFISH_ENABLED === 'true'
const MAX_ANALYSES_PER_HOUR = 100
const CIRCUIT_BREAKER_THRESHOLD = 3   // consecutive failures before opening
const CIRCUIT_BREAKER_RESET_MS = 60_000  // 1 min before retrying

// ─── Circuit Breaker State ──────────────────────────────────────────────────

let consecutiveFailures = 0
let circuitOpenUntil = 0
let analysesThisHour = 0
let hourResetAt = Date.now() + 3600_000

function isCircuitOpen(): boolean {
  if (Date.now() < circuitOpenUntil) return true
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS
    return true
  }
  return false
}

function recordSuccess() {
  consecutiveFailures = 0
}

function recordFailure() {
  consecutiveFailures++
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS
    logger.warn({ consecutiveFailures }, '[MiroFish] Circuit breaker OPEN — pausing requests')
  }
}

function checkRateLimit(): boolean {
  if (Date.now() > hourResetAt) {
    analysesThisHour = 0
    hourResetAt = Date.now() + 3600_000
  }
  return analysesThisHour < MAX_ANALYSES_PER_HOUR
}

// ─── Health Check ───────────────────────────────────────────────────────────

export async function isMiroFishAvailable(): Promise<boolean> {
  if (!MIROFISH_ENABLED) return false
  if (isCircuitOpen()) return false

  try {
    const res = await fetch(`${MIROFISH_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      recordSuccess()
      return true
    }
    recordFailure()
    return false
  } catch {
    recordFailure()
    return false
  }
}

// ─── Core HTTP Client ───────────────────────────────────────────────────────

async function mirofishPost(path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${MIROFISH_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`MiroFish ${path} returned ${res.status}: ${text.slice(0, 200)}`)
  }

  return res.json()
}

async function mirofishGet(path: string): Promise<any> {
  const res = await fetch(`${MIROFISH_URL}${path}`, {
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    throw new Error(`MiroFish GET ${path} returned ${res.status}`)
  }

  return res.json()
}

// ─── Fraud Analysis ─────────────────────────────────────────────────────────

interface FraudAnalysisInput {
  tenderId: string
  companyId: string
  competitors: Array<{
    cnpj: string
    razao_social: string
    valor_proposta: number | null
    is_winner: boolean
  }>
  existingAlerts: Array<{
    alert_type: string
    severity: string
    detail: string
  }>
  tenderInfo: {
    objeto: string
    orgao_nome: string
    valor_estimado: number | null
    uf: string
    modalidade_nome: string
  }
}

/**
 * Build a Markdown document from Licitagram fraud data for MiroFish ingestion.
 */
export function buildFraudDocument(input: FraudAnalysisInput): string {
  const { competitors, existingAlerts, tenderInfo } = input

  let doc = `# Analise de Fraude: Licitacao\n\n`
  doc += `## Dados da Licitacao\n`
  doc += `- **Objeto**: ${tenderInfo.objeto}\n`
  doc += `- **Orgao**: ${tenderInfo.orgao_nome}\n`
  doc += `- **UF**: ${tenderInfo.uf}\n`
  doc += `- **Modalidade**: ${tenderInfo.modalidade_nome}\n`
  doc += `- **Valor Estimado**: ${tenderInfo.valor_estimado ? `R$ ${Number(tenderInfo.valor_estimado).toLocaleString('pt-BR')}` : 'Nao informado'}\n\n`

  doc += `## Empresas Participantes (${competitors.length})\n\n`
  for (const c of competitors) {
    const winner = c.is_winner ? ' **[VENCEDORA]**' : ''
    const valor = c.valor_proposta ? `R$ ${Number(c.valor_proposta).toLocaleString('pt-BR')}` : 'N/I'
    doc += `### ${c.razao_social}${winner}\n`
    doc += `- CNPJ: ${c.cnpj}\n`
    doc += `- Valor Proposta: ${valor}\n`
  }

  doc += `\n## Alertas Existentes (${existingAlerts.length})\n\n`
  for (const a of existingAlerts) {
    doc += `- **[${a.severity}] ${a.alert_type}**: ${a.detail}\n`
  }

  return doc
}

/**
 * Expand the corporate graph 2 hops from competitors' partners.
 * Queries local PostgreSQL for socios and empresas data.
 */
export async function expandCorporateGraph(cnpjs: string[]): Promise<{
  partners: Array<{ cnpj_empresa: string; nome_socio: string; cnpj_cpf_socio: string }>
  relatedCompanies: Array<{ cnpj: string; razao_social: string; capital_social: number | null }>
}> {
  if (cnpjs.length === 0) return { partners: [], relatedCompanies: [] }

  try {
    // Hop 1: Get all partners of the competitors
    const { rows: partners } = await localPool.query(
      `SELECT cnpj, nome_socio, cnpj_cpf_socio FROM socios WHERE cnpj = ANY($1) LIMIT 200`,
      [cnpjs],
    )

    // Hop 2: Find other companies these partners are in
    const partnerIds = [...new Set(partners.map((p: any) => p.cnpj_cpf_socio).filter(Boolean))]
    if (partnerIds.length === 0) return { partners, relatedCompanies: [] }

    const { rows: relatedCnpjs } = await localPool.query(
      `SELECT DISTINCT cnpj FROM socios WHERE cnpj_cpf_socio = ANY($1) AND cnpj != ALL($2) LIMIT 50`,
      [partnerIds, cnpjs],
    )

    const relatedCnpjList = relatedCnpjs.map((r: any) => r.cnpj)
    if (relatedCnpjList.length === 0) return { partners, relatedCompanies: [] }

    const { rows: relatedCompanies } = await localPool.query(
      `SELECT cnpj, razao_social, capital_social FROM empresas WHERE cnpj = ANY($1) LIMIT 50`,
      [relatedCnpjList],
    )

    return {
      partners: partners.map((p: any) => ({
        cnpj_empresa: p.cnpj,
        nome_socio: p.nome_socio,
        cnpj_cpf_socio: p.cnpj_cpf_socio,
      })),
      relatedCompanies: relatedCompanies.map((c: any) => ({
        cnpj: c.cnpj,
        razao_social: c.razao_social,
        capital_social: c.capital_social,
      })),
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, '[MiroFish] Failed to expand corporate graph from local PG')
    return { partners: [], relatedCompanies: [] }
  }
}

/**
 * Submit a fraud analysis to MiroFish. Returns a task/project ID for polling.
 */
export async function submitFraudAnalysis(input: FraudAnalysisInput): Promise<{
  success: boolean
  projectId?: string
  error?: string
}> {
  if (!MIROFISH_ENABLED) return { success: false, error: 'MiroFish disabled' }
  if (isCircuitOpen()) return { success: false, error: 'Circuit breaker open' }
  if (!checkRateLimit()) return { success: false, error: 'Rate limit exceeded' }

  try {
    analysesThisHour++
    const document = buildFraudDocument(input)

    // Expand graph with 2-hop partner network
    const cnpjs = input.competitors.map((c) => c.cnpj)
    const { partners, relatedCompanies } = await expandCorporateGraph(cnpjs)

    // Append expanded graph to document
    let expandedDoc = document
    if (partners.length > 0) {
      expandedDoc += `\n## Rede Societaria (${partners.length} socios, ${relatedCompanies.length} empresas relacionadas)\n\n`
      for (const p of partners) {
        expandedDoc += `- Empresa ${p.cnpj_empresa} → Socio ${p.nome_socio} (${p.cnpj_cpf_socio})\n`
      }
      if (relatedCompanies.length > 0) {
        expandedDoc += `\n### Empresas Relacionadas (2o hop)\n`
        for (const c of relatedCompanies) {
          const capital = c.capital_social ? `R$ ${Number(c.capital_social).toLocaleString('pt-BR')}` : 'N/I'
          expandedDoc += `- ${c.razao_social} (${c.cnpj}) — Capital: ${capital}\n`
        }
      }
    }

    // Submit to MiroFish
    const result = await mirofishPost('/api/licitagram/fraud-analysis', {
      document: expandedDoc,
      tender_id: input.tenderId,
      simulation_requirement: `Analisar rede societaria de ${input.competitors.length} empresas participantes desta licitacao para detectar conluio, bid rotation, cover bidding ou market allocation. Identificar conexoes ocultas alem de 1 hop.`,
    })

    recordSuccess()
    logger.info({ tenderId: input.tenderId, projectId: result.data?.project_id }, '[MiroFish] Fraud analysis submitted')

    return {
      success: true,
      projectId: result.data?.project_id,
    }
  } catch (err: any) {
    recordFailure()
    logger.error({ err: err.message, tenderId: input.tenderId }, '[MiroFish] Fraud analysis failed')
    return { success: false, error: err.message }
  }
}

// ─── Price Analysis ─────────────────────────────────────────────────────────

interface PriceAnalysisInput {
  queryHash: string
  companyId: string
  itemDescription: string
  priceRecords: Array<{
    unit_price: number
    supplier_cnpj: string
    date: string
    uf: string
  }>
  statistics: {
    mean: number
    median: number
    std_deviation: number
    cv_percent: number
    count: number
  }
  supplierStats: Array<{
    cnpj: string
    razao_social: string
    win_rate: number
    desconto_medio: number
    total_participacoes: number
  }>
}

/**
 * Build a Markdown document from price history data for MiroFish.
 */
export function buildPriceDocument(input: PriceAnalysisInput): string {
  const { itemDescription, priceRecords, statistics, supplierStats } = input

  let doc = `# Previsao de Preco: ${itemDescription}\n\n`
  doc += `## Estatisticas Atuais\n`
  doc += `- Media: R$ ${statistics.mean.toFixed(2)}\n`
  doc += `- Mediana: R$ ${statistics.median.toFixed(2)}\n`
  doc += `- Desvio Padrao: R$ ${statistics.std_deviation.toFixed(2)}\n`
  doc += `- CV: ${statistics.cv_percent.toFixed(1)}%\n`
  doc += `- Registros: ${statistics.count}\n\n`

  doc += `## Historico de Precos (${priceRecords.length} registros)\n\n`
  const byMonth = new Map<string, number[]>()
  for (const r of priceRecords.slice(0, 100)) {
    const month = r.date.slice(0, 7)
    if (!byMonth.has(month)) byMonth.set(month, [])
    byMonth.get(month)!.push(r.unit_price)
  }
  for (const [month, prices] of Array.from(byMonth.entries()).sort()) {
    const median = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)]
    doc += `- ${month}: R$ ${median.toFixed(2)} (mediana de ${prices.length} registros)\n`
  }

  doc += `\n## Fornecedores (${supplierStats.length})\n\n`
  for (const s of supplierStats.slice(0, 20)) {
    doc += `### ${s.razao_social}\n`
    doc += `- CNPJ: ${s.cnpj}\n`
    doc += `- Taxa de vitoria: ${(s.win_rate * 100).toFixed(1)}%\n`
    doc += `- Desconto medio: ${s.desconto_medio.toFixed(1)}%\n`
    doc += `- Participacoes: ${s.total_participacoes}\n\n`
  }

  return doc
}

/**
 * Submit a price analysis to MiroFish.
 */
export async function submitPriceAnalysis(input: PriceAnalysisInput): Promise<{
  success: boolean
  projectId?: string
  error?: string
}> {
  if (!MIROFISH_ENABLED) return { success: false, error: 'MiroFish disabled' }
  if (isCircuitOpen()) return { success: false, error: 'Circuit breaker open' }
  if (!checkRateLimit()) return { success: false, error: 'Rate limit exceeded' }

  try {
    analysesThisHour++
    const document = buildPriceDocument(input)

    const result = await mirofishPost('/api/licitagram/price-analysis', {
      document,
      query_hash: input.queryHash,
      simulation_requirement: `Simular comportamento de ${input.supplierStats.length} fornecedores competindo por "${input.itemDescription}". Prever faixa de preco para proxima licitacao e identificar anomalias de preco que possam indicar conluio.`,
    })

    recordSuccess()
    logger.info({ queryHash: input.queryHash, projectId: result.data?.project_id }, '[MiroFish] Price analysis submitted')

    return {
      success: true,
      projectId: result.data?.project_id,
    }
  } catch (err: any) {
    recordFailure()
    logger.error({ err: err.message, queryHash: input.queryHash }, '[MiroFish] Price analysis failed')
    return { success: false, error: err.message }
  }
}

// ─── Chat with Report Agent ─────────────────────────────────────────────────

export async function chatWithAgent(simulationId: string, message: string, history: Array<{ role: string; content: string }> = []): Promise<{
  success: boolean
  response?: string
  error?: string
}> {
  if (!MIROFISH_ENABLED) return { success: false, error: 'MiroFish disabled' }
  if (isCircuitOpen()) return { success: false, error: 'Circuit breaker open' }

  try {
    const result = await mirofishPost('/api/report/chat', {
      simulation_id: simulationId,
      message,
      chat_history: history,
    })

    recordSuccess()
    return {
      success: true,
      response: result.data?.response,
    }
  } catch (err: any) {
    recordFailure()
    return { success: false, error: err.message }
  }
}

// ─── Poll for Task Completion ───────────────────────────────────────────────

export async function pollTaskStatus(taskId: string): Promise<{
  status: 'processing' | 'completed' | 'failed'
  progress?: number
  result?: any
}> {
  try {
    const data = await mirofishGet(`/api/graph/task/${taskId}`)
    return {
      status: data.data?.status || 'processing',
      progress: data.data?.progress,
      result: data.data?.result,
    }
  } catch {
    return { status: 'failed' }
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

export const mirofish = {
  isEnabled: () => MIROFISH_ENABLED,
  isAvailable: isMiroFishAvailable,
  fraud: {
    buildDocument: buildFraudDocument,
    expandGraph: expandCorporateGraph,
    submit: submitFraudAnalysis,
  },
  price: {
    buildDocument: buildPriceDocument,
    submit: submitPriceAnalysis,
  },
  chat: chatWithAgent,
  poll: pollTaskStatus,
}
