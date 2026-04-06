/**
 * Lead Engine — Worker de População Inicial
 *
 * Popula admin_leads_fornecedores em batches de 10.000 CNPJs.
 * Para cada CNPJ que participou de >= 1 licitação nos últimos 24 meses:
 *   1. JOIN com RFB empresas (VPS2 local) para dados cadastrais
 *   2. JOIN com sancoes (VPS2 local) para compliance
 *   3. Calcula scoring proprietário
 *   4. Exclui clientes atuais do Licitagram
 *   5. UPSERT idempotente por CNPJ
 *
 * Fonte principal: competitor_stats (Supabase, 21K+ CNPJs) + competitors (290K+ linhas)
 * Enriquecimento: empresas + sancoes (VPS2 licitagram_data)
 *
 * Idempotente: rodar 2x não duplica nada (UPSERT por CNPJ).
 */

import { localPool } from '../lib/local-db'
import { supabase } from '../lib/supabase'
import {
  calcularScoreLead,
  gerarMotivoQualificacao,
  filtrarEmailGenerico,
  mapPorteRfb,
} from './scoring'
import pino from 'pino'

const logger = pino({ name: 'populate-leads-worker', level: process.env.LOG_LEVEL || 'info' })

const BATCH_SIZE = 10_000
const DATA_API_URL = process.env.DATA_API_URL || 'http://85.31.60.53:3998'
const BATCH_API_SIZE = 100 // Max CNPJs per Data API batch call

// ─── Types ──────────────────────────────────────────────────

interface CompetitorStatsRow {
  cnpj: string
  razao_social: string | null
  porte: string | null
  cnae_divisao: string | null
  uf: string | null
  total_participacoes: number
  total_vitorias: number
  win_rate: number
  valor_total_ganho: number
  desconto_medio: number
  modalidades: Record<string, boolean>
  ufs_atuacao: Record<string, boolean>
  orgaos_frequentes: Record<string, boolean>
  ultima_participacao: string | null
  email: string | null
  telefone: string | null
  municipio: string | null
  natureza_juridica: string | null
}

interface EmpresaRfb {
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  cnae_fiscal: string | null
  descricao_cnae_principal: string | null
  cnae_fiscal_secundaria: string | null
  porte_empresa: string | null
  capital_social: number | null
  data_inicio_atividade: string | null
  natureza_juridica: string | null
  situacao_cadastral: string | null
  uf: string | null
  municipio: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cep: string | null
  ddd_1: string | null
  telefone_1: string | null
  email: string | null
}

interface SancaoRow {
  cnpj: string
  tipo_sancao: string
  orgao_sancionador: string
  data_inicio: string
  data_fim: string | null
}

interface Metrics {
  totalProcessado: number
  totalQualificado: number
  totalBloqueado: number
  totalComEmailGenerico: number
  totalBatches: number
  tempoTotalMs: number
}

// ─── Data API fetch helpers ─────────────────────────────────

async function fetchBatchEmpresas(cnpjs: string[]): Promise<Record<string, EmpresaRfb>> {
  const all: Record<string, EmpresaRfb> = {}
  // Chunk into groups of BATCH_API_SIZE
  for (let i = 0; i < cnpjs.length; i += BATCH_API_SIZE) {
    const chunk = cnpjs.slice(i, i + BATCH_API_SIZE)
    try {
      const res = await fetch(`${DATA_API_URL}/api/batch/empresas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpjs: chunk }),
      })
      if (res.ok) {
        const data = await res.json()
        Object.assign(all, data.results || {})
      }
    } catch (err) {
      // Fallback: individual queries
      for (const cnpj of chunk) {
        try {
          const res = await fetch(`${DATA_API_URL}/api/empresa/${cnpj}`)
          if (res.ok) {
            const emp = await res.json()
            if (emp && emp.cnpj) all[emp.cnpj] = emp
          }
        } catch { /* skip */ }
      }
    }
  }
  return all
}

async function fetchBatchSancoes(cnpjs: string[]): Promise<Record<string, SancaoRow[]>> {
  const all: Record<string, SancaoRow[]> = {}
  for (let i = 0; i < cnpjs.length; i += BATCH_API_SIZE) {
    const chunk = cnpjs.slice(i, i + BATCH_API_SIZE)
    try {
      const res = await fetch(`${DATA_API_URL}/api/batch/sancoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpjs: chunk }),
      })
      if (res.ok) {
        const data = await res.json()
        Object.assign(all, data.results || {})
      }
    } catch { /* skip */ }
  }
  return all
}

// ─── Licitagram client check ────────────────────────────────

async function getClientCnpjs(): Promise<Set<string>> {
  const { data } = await supabase.from('companies').select('cnpj')
  if (!data) return new Set()
  return new Set(data.map((c: { cnpj: string }) => c.cnpj).filter(Boolean))
}

// ─── Fetch detailed stats from competitors + tenders (12m) ──

interface DetailedStats {
  totalParticipacoes12m: number
  totalVitorias12m: number
  valorGanho12m: number
  orgaosDistintos12m: number
  orgaoTopNome: string | null
  orgaoTopLista: Array<{ nome: string; cnpj: string; count: number }>
  esferasAtuacao: string[]
  licitacoesPerdidasPorPouco: number
  margemMediaPerda: number | null
  diversidadeCnaeEditais: number
  maiorContratoValor: number
  ticketMedio: number
}

async function fetchDetailedStats(cnpjs: string[]): Promise<Map<string, DetailedStats>> {
  const result = new Map<string, DetailedStats>()

  // We'll query Supabase in batches
  for (let i = 0; i < cnpjs.length; i += 500) {
    const chunk = cnpjs.slice(i, i + 500)

    // 12-month participation data
    const dozeAno = new Date()
    dozeAno.setMonth(dozeAno.getMonth() - 12)
    const dozeAnoIso = dozeAno.toISOString()

    const { data: competitorRows } = await supabase
      .from('competitors')
      .select(`
        cnpj,
        valor_proposta,
        situacao,
        cnae_codigo,
        tender_id,
        tenders!inner(
          orgao_cnpj,
          orgao_nome,
          orgao_esfera,
          valor_estimado,
          valor_homologado,
          data_publicacao
        )
      `)
      .in('cnpj', chunk)
      .gte('tenders.data_publicacao', dozeAnoIso)

    if (!competitorRows) continue

    // Aggregate by CNPJ
    const byC = new Map<string, typeof competitorRows>()
    for (const row of competitorRows) {
      if (!row.cnpj) continue
      if (!byC.has(row.cnpj)) byC.set(row.cnpj, [])
      byC.get(row.cnpj)!.push(row)
    }

    for (const [cnpj, rows] of byC) {
      const participacoes12m = rows.length
      const vitorias12m = rows.filter(r =>
        r.situacao && r.situacao.toLowerCase().includes('homologad')
      )
      const valorGanho12m = vitorias12m.reduce((s, r) => s + (Number(r.valor_proposta) || 0), 0)

      // Órgãos distintos
      const orgaoMap = new Map<string, { nome: string; cnpj: string; count: number }>()
      const esferasSet = new Set<string>()
      const cnaeSet = new Set<string>()

      for (const r of rows) {
        const t = r.tenders as any
        if (t?.orgao_cnpj) {
          const existing = orgaoMap.get(t.orgao_cnpj)
          if (existing) existing.count++
          else orgaoMap.set(t.orgao_cnpj, { nome: t.orgao_nome || t.orgao_cnpj, cnpj: t.orgao_cnpj, count: 1 })
        }
        if (t?.orgao_esfera) esferasSet.add(t.orgao_esfera.toLowerCase())
        if (r.cnae_codigo) cnaeSet.add(String(r.cnae_codigo).substring(0, 2))
      }

      // Perdeu por pouco: participou mas não ganhou, e valor_proposta é <= 5% acima do valor_homologado
      let perdidasPorPouco = 0
      const margensPerda: number[] = []
      for (const r of rows) {
        const t = r.tenders as any
        if (r.situacao && r.situacao.toLowerCase().includes('homologad')) continue // ganhou
        if (!r.valor_proposta || !t?.valor_homologado || t.valor_homologado <= 0) continue
        const margem = (Number(r.valor_proposta) - Number(t.valor_homologado)) / Number(t.valor_homologado)
        if (margem > 0 && margem < 0.05) {
          perdidasPorPouco++
          margensPerda.push(margem * 100)
        }
      }

      // Maior contrato
      const maiorContrato = vitorias12m.reduce((max, r) => Math.max(max, Number(r.valor_proposta) || 0), 0)

      // Top 10 órgãos
      const orgaoTopLista = Array.from(orgaoMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      const ticketMedio = vitorias12m.length > 0 ? valorGanho12m / vitorias12m.length : 0

      result.set(cnpj, {
        totalParticipacoes12m: participacoes12m,
        totalVitorias12m: vitorias12m.length,
        valorGanho12m,
        orgaosDistintos12m: orgaoMap.size,
        orgaoTopNome: orgaoTopLista[0]?.nome || null,
        orgaoTopLista,
        esferasAtuacao: Array.from(esferasSet),
        licitacoesPerdidasPorPouco: perdidasPorPouco,
        margemMediaPerda: margensPerda.length > 0
          ? margensPerda.reduce((s, m) => s + m, 0) / margensPerda.length
          : null,
        diversidadeCnaeEditais: cnaeSet.size,
        maiorContratoValor: maiorContrato,
        ticketMedio,
      })
    }
  }

  return result
}

// ─── CNAE segmento mapping (TS version) ─────────────────────

function mapCnaeSegmento(cnae: string | null): string {
  if (!cnae) return 'Outros'
  const div = cnae.substring(0, 2)
  const map: Record<string, string> = {
    '41': 'Construção de Edifícios', '42': 'Infraestrutura', '43': 'Serviços de Construção',
    '62': 'Tecnologia da Informação', '63': 'Serviços de Informação', '61': 'Telecomunicações',
    '86': 'Saúde', '21': 'Farmacêutico', '32': 'Equipamentos Médicos',
    '10': 'Alimentos', '56': 'Alimentação e Refeições', '11': 'Bebidas',
    '81': 'Limpeza e Facilities', '80': 'Segurança',
    '46': 'Comércio Atacadista', '47': 'Comércio Varejista',
    '49': 'Transporte Terrestre', '52': 'Armazenamento e Logística',
    '69': 'Consultoria Jurídica/Contábil', '70': 'Consultoria Empresarial',
    '71': 'Engenharia e Arquitetura', '73': 'Marketing e Publicidade', '74': 'Serviços Técnicos',
    '85': 'Educação', '25': 'Produtos de Metal', '28': 'Máquinas e Equipamentos',
    '33': 'Manutenção Industrial', '35': 'Energia e Gás', '38': 'Resíduos',
    '77': 'Locação de Equipamentos', '78': 'Recursos Humanos', '82': 'Serviços Administrativos',
  }
  return map[div] || `Outros (${div})`
}

// ─── Main population function ───────────────────────────────

export async function populateLeads(options: {
  dryRun?: boolean
  limit?: number // max CNPJs to process (for testing)
} = {}): Promise<Metrics> {
  const { dryRun = false, limit } = options
  const startTime = Date.now()
  const metrics: Metrics = {
    totalProcessado: 0,
    totalQualificado: 0,
    totalBloqueado: 0,
    totalComEmailGenerico: 0,
    totalBatches: 0,
    tempoTotalMs: 0,
  }

  logger.info({ dryRun, limit }, '🚀 Iniciando população de leads')

  // 1. Get client CNPJs to exclude
  const clientCnpjs = await getClientCnpjs()
  logger.info({ clientCount: clientCnpjs.size }, 'Clientes Licitagram carregados para exclusão')

  // 2. Ensure lead table exists on local DB
  if (!dryRun) {
    await ensureLeadTableExists()
  }

  // 3. Fetch all competitor_stats CNPJs from Supabase (paginated)
  const allCnpjs: CompetitorStatsRow[] = []
  let page = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('competitor_stats')
      .select('*')
      .order('total_participacoes', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) {
      logger.error({ error }, 'Erro ao buscar competitor_stats')
      break
    }
    if (!data || data.length === 0) break

    allCnpjs.push(...data)
    page++

    if (limit && allCnpjs.length >= limit) {
      allCnpjs.length = limit
      break
    }
  }

  logger.info({ totalCnpjs: allCnpjs.length }, 'CNPJs carregados de competitor_stats')

  // 4. Process in batches
  for (let i = 0; i < allCnpjs.length; i += BATCH_SIZE) {
    const batchStart = Date.now()
    const batch = allCnpjs.slice(i, i + BATCH_SIZE)
    const batchCnpjs = batch.map(b => b.cnpj).filter(Boolean)
    metrics.totalBatches++

    logger.info({
      batch: metrics.totalBatches,
      size: batch.length,
      offset: i,
      total: allCnpjs.length,
    }, `📦 Processando batch ${metrics.totalBatches}`)

    // 4a. Fetch RFB data for this batch
    const empresasRfb = await fetchBatchEmpresas(batchCnpjs)
    logger.info({ fetched: Object.keys(empresasRfb).length }, 'RFB empresas carregadas')

    // 4b. Fetch sanctions data
    const sancoesMap = await fetchBatchSancoes(batchCnpjs)
    logger.info({ fetched: Object.keys(sancoesMap).length }, 'Sanções carregadas')

    // 4c. Fetch detailed 12m stats from Supabase
    const detailedStats = await fetchDetailedStats(batchCnpjs)
    logger.info({ fetched: detailedStats.size }, 'Stats detalhados 12m carregados')

    // 4d. Build leads and UPSERT
    const upsertValues: string[] = []
    const upsertParams: unknown[] = []
    let paramIdx = 1

    for (const stat of batch) {
      if (!stat.cnpj) continue
      // Sanitize CNPJ: keep only digits, pad to 14, truncate if longer
      const cnpjClean = stat.cnpj.replace(/\D/g, '')
      if (cnpjClean.length < 8 || cnpjClean.length > 14) {
        logger.warn({ cnpj: stat.cnpj, len: cnpjClean.length }, 'CNPJ inválido, pulando')
        continue
      }
      stat.cnpj = cnpjClean.padStart(14, '0')
      metrics.totalProcessado++

      const rfb = empresasRfb[stat.cnpj]
      const sancoes = sancoesMap[stat.cnpj] || []
      const detailed = detailedStats.get(stat.cnpj)

      // Determine if client
      const jaCliente = clientCnpjs.has(stat.cnpj)

      // Sanctions
      const statusCeis = sancoes.some(s => s.tipo_sancao?.toUpperCase().includes('CEIS'))
      const statusCnep = sancoes.some(s => s.tipo_sancao?.toUpperCase().includes('CNEP'))
      const statusCepim = sancoes.some(s => s.tipo_sancao?.toUpperCase().includes('CEPIM'))
      const estaLimpo = !statusCeis && !statusCnep && !statusCepim

      // Date calculations
      const ultimaPart = stat.ultima_participacao ? new Date(stat.ultima_participacao) : null
      const diasDesdeUltima = ultimaPart ? Math.floor((Date.now() - ultimaPart.getTime()) / (86400 * 1000)) : null

      // Scoring
      const scoringInput = {
        diasDesdeUltimaParticipacao: diasDesdeUltima,
        totalLicitacoes12m: detailed?.totalParticipacoes12m || 0,
        ticketMedioContratos: detailed?.ticketMedio || 0,
        licitacoesPerdidasPorPouco12m: detailed?.licitacoesPerdidasPorPouco || 0,
        orgaosDistintos12m: detailed?.orgaosDistintos12m || 0,
        statusCeis,
        statusCnep,
        statusCepim,
        jaEClienteLicitagram: jaCliente,
        situacaoCadastral: rfb?.situacao_cadastral || null,
        optOut: false, // New leads start without opt-out
      }
      const scoring = calcularScoreLead(scoringInput)

      if (scoring.bloqueadoDisparo) metrics.totalBloqueado++
      if (scoring.score >= 20) metrics.totalQualificado++

      // Email filter
      const emailRaw = rfb?.email || stat.email || null
      const emailGenerico = filtrarEmailGenerico(emailRaw)
      if (emailGenerico) metrics.totalComEmailGenerico++

      // Porte mapping
      const porte = mapPorteRfb(rfb?.porte_empresa || stat.porte)

      // CNAE
      const cnaeCodigo = rfb?.cnae_fiscal || (stat.cnae_divisao ? stat.cnae_divisao.padEnd(7, '0') : null)
      const cnaeDescricao = rfb?.descricao_cnae_principal || null

      // Segmento
      const segmento = mapCnaeSegmento(cnaeCodigo)

      // Address
      const endereco = rfb
        ? [rfb.logradouro, rfb.numero, rfb.complemento, rfb.bairro].filter(Boolean).join(', ')
        : null

      // Telefone
      const telefone = rfb?.ddd_1 && rfb?.telefone_1
        ? `(${rfb.ddd_1}) ${rfb.telefone_1}`
        : stat.telefone || null

      // Motivo qualificacao
      const motivo = gerarMotivoQualificacao({
        razaoSocial: rfb?.razao_social || stat.razao_social || stat.cnpj,
        totalParticipacoes12m: detailed?.totalParticipacoes12m || 0,
        totalVitorias12m: detailed?.totalVitorias12m || 0,
        ticketMedio: detailed?.ticketMedio || 0,
        orgaoTop: detailed?.orgaoTopNome || null,
        perdasPorPouco: detailed?.licitacoesPerdidasPorPouco || 0,
        margemMediaPerda: detailed?.margemMediaPerda || null,
        score: scoring.score,
        plano: scoring.planoRecomendado,
        estaLimpo,
      })

      // Build UPSERT row params (41 columns)
      const rowParams = [
        stat.cnpj.substring(0, 14),                                    // 1 cnpj
        stat.cnpj.substring(0, 8),                                     // 2 cnpj_raiz
        rfb?.razao_social || stat.razao_social || 'N/D',              // 3 razao_social
        rfb?.nome_fantasia || null,                                   // 4 nome_fantasia
        rfb?.natureza_juridica || stat.natureza_juridica || null,     // 5 natureza_juridica
        porte,                                                        // 6 porte
        rfb?.data_inicio_atividade || null,                           // 7 data_abertura
        rfb?.situacao_cadastral || null,                              // 8 situacao_cadastral
        rfb?.uf || stat.uf || null,                                   // 9 uf
        rfb?.municipio || stat.municipio || null,                     // 10 municipio
        (rfb?.cep || '').replace(/\D/g, '').substring(0, 8) || null,    // 11 cep
        endereco || null,                                             // 12 endereco_completo
        cnaeCodigo?.substring(0, 7) || null,                            // 13 cnae_principal_codigo
        cnaeDescricao || null,                                        // 14 cnae_principal_descricao
        JSON.stringify([]),                                           // 15 cnae_secundarios
        emailGenerico,                                                // 16 email_institucional_generico
        emailGenerico ? 'RFB_CADASTRAL' : 'NAO_ENRIQUECIDO',         // 17 email_institucional_fonte
        false,                                                        // 18 email_institucional_validado
        telefone,                                                     // 19 telefone_comercial
        telefone ? 'RFB_CADASTRAL' : 'NAO_ENRIQUECIDO',              // 20 telefone_fonte
        null,                                                         // 21 site_institucional
        null,                                                         // 22 linkedin_empresa
        null,                                                         // 23 whatsapp_comercial
        detailed?.totalParticipacoes12m || 0,                         // 24 total_licitacoes_participadas_12m
        stat.total_participacoes || 0,                                // 25 total_licitacoes_participadas_total
        detailed?.totalVitorias12m || 0,                              // 26 total_licitacoes_ganhas_12m
        stat.total_vitorias || 0,                                     // 27 total_licitacoes_ganhas_total
        Number(stat.win_rate) || 0,                                   // 28 taxa_conversao_vitoria
        detailed?.valorGanho12m || 0,                                 // 29 valor_total_contratos_ganhos_12m
        Number(stat.valor_total_ganho) || 0,                          // 30 valor_total_contratos_ganhos_total
        detailed?.ticketMedio || 0,                                   // 31 ticket_medio_contratos
        detailed?.maiorContratoValor || 0,                            // 32 maior_contrato_valor
        detailed?.orgaosDistintos12m || 0,                            // 33 orgaos_compradores_distintos_12m
        JSON.stringify(detailed?.orgaoTopLista || []),                 // 34 orgaos_compradores_lista
        JSON.stringify(detailed?.esferasAtuacao || []),                // 35 esferas_atuacao
        ultimaPart?.toISOString() || null,                            // 36 ultima_participacao_data
        diasDesdeUltima || 0,                                         // 37 dias_desde_ultima_participacao
        detailed?.licitacoesPerdidasPorPouco || 0,                    // 38 licitacoes_perdidas_por_pouco
        detailed?.diversidadeCnaeEditais || 0,                        // 39 diversidade_cnae_editais
        statusCeis,                                                   // 40 status_ceis
        statusCnep,                                                   // 41 status_cnep
        statusCepim,                                                  // 42 status_cepim
        estaLimpo,                                                    // 43 esta_limpo
        new Date().toISOString(),                                     // 44 data_ultima_verificacao_sancoes
        scoring.score,                                                // 45 score_fit_licitagram
        scoring.planoRecomendado,                                     // 46 plano_recomendado
        segmento,                                                     // 47 segmento_vertical
        scoring.prioridadeOutreach,                                   // 48 prioridade_outreach
        motivo,                                                       // 49 motivo_qualificacao
        jaCliente,                                                    // 50 ja_e_cliente_licitagram
        scoring.bloqueadoDisparo,                                     // 51 bloqueado_disparo
        scoring.motivoBloqueio || null,                               // 52 motivo_bloqueio
        1,                                                            // 53 versao_score
      ]

      // Build placeholder tuple
      const placeholders = rowParams.map(() => `$${paramIdx++}`).join(', ')
      upsertValues.push(`(${placeholders})`)
      upsertParams.push(...rowParams)

      // Flush every 500 rows to avoid huge queries
      if (upsertValues.length >= 500 || metrics.totalProcessado === allCnpjs.length) {
        if (!dryRun && upsertValues.length > 0) {
          try {
            await executeUpsert(upsertValues, upsertParams)
          } catch (err) {
            logger.error({ err, tuples: upsertValues.length }, 'Erro no UPSERT batch (skipping)')
          }
        }
        upsertValues.length = 0
        upsertParams.length = 0
        paramIdx = 1
      }
    }

    // Flush remaining
    if (!dryRun && upsertValues.length > 0) {
      try {
        await executeUpsert(upsertValues, upsertParams)
      } catch (err) {
        logger.error({ err, tuples: upsertValues.length }, 'Erro no UPSERT final batch (skipping)')
      }
      upsertValues.length = 0
      upsertParams.length = 0
      paramIdx = 1
    }

    const batchMs = Date.now() - batchStart
    logger.info({
      batch: metrics.totalBatches,
      batchMs,
      processed: metrics.totalProcessado,
      qualified: metrics.totalQualificado,
      blocked: metrics.totalBloqueado,
      withEmail: metrics.totalComEmailGenerico,
    }, `✅ Batch ${metrics.totalBatches} concluído em ${batchMs}ms`)
  }

  metrics.tempoTotalMs = Date.now() - startTime

  // Log audit
  if (!dryRun) {
    await logAudit('worker_run', null, {
      tipo: 'populate_leads',
      ...metrics,
    })
  }

  logger.info(metrics, '🏁 População de leads concluída')
  return metrics
}

// ─── UPSERT execution ───────────────────────────────────────

async function executeUpsert(valueTuples: string[], params: unknown[]) {
  const sql = `
    INSERT INTO admin_leads_fornecedores (
      cnpj, cnpj_raiz, razao_social, nome_fantasia, natureza_juridica,
      porte, data_abertura, situacao_cadastral,
      uf, municipio, cep, endereco_completo,
      cnae_principal_codigo, cnae_principal_descricao, cnae_secundarios,
      email_institucional_generico, email_institucional_fonte, email_institucional_validado,
      telefone_comercial, telefone_fonte,
      site_institucional, linkedin_empresa, whatsapp_comercial,
      total_licitacoes_participadas_12m, total_licitacoes_participadas_total,
      total_licitacoes_ganhas_12m, total_licitacoes_ganhas_total,
      taxa_conversao_vitoria,
      valor_total_contratos_ganhos_12m, valor_total_contratos_ganhos_total,
      ticket_medio_contratos, maior_contrato_valor,
      orgaos_compradores_distintos_12m, orgaos_compradores_lista, esferas_atuacao,
      ultima_participacao_data, dias_desde_ultima_participacao,
      licitacoes_perdidas_por_pouco, diversidade_cnae_editais,
      status_ceis, status_cnep, status_cepim, esta_limpo,
      data_ultima_verificacao_sancoes,
      score_fit_licitagram, plano_recomendado, segmento_vertical,
      prioridade_outreach, motivo_qualificacao,
      ja_e_cliente_licitagram, bloqueado_disparo, motivo_bloqueio,
      versao_score
    ) VALUES ${valueTuples.join(', ')}
    ON CONFLICT (cnpj) DO UPDATE SET
      razao_social = EXCLUDED.razao_social,
      nome_fantasia = EXCLUDED.nome_fantasia,
      natureza_juridica = EXCLUDED.natureza_juridica,
      porte = EXCLUDED.porte,
      data_abertura = EXCLUDED.data_abertura,
      situacao_cadastral = EXCLUDED.situacao_cadastral,
      uf = EXCLUDED.uf,
      municipio = EXCLUDED.municipio,
      cep = EXCLUDED.cep,
      endereco_completo = EXCLUDED.endereco_completo,
      cnae_principal_codigo = EXCLUDED.cnae_principal_codigo,
      cnae_principal_descricao = EXCLUDED.cnae_principal_descricao,
      cnae_secundarios = EXCLUDED.cnae_secundarios,
      -- Email: só atualiza se lead NÃO tem opt_out
      email_institucional_generico = CASE
        WHEN admin_leads_fornecedores.opt_out = true THEN admin_leads_fornecedores.email_institucional_generico
        ELSE EXCLUDED.email_institucional_generico
      END,
      email_institucional_fonte = CASE
        WHEN admin_leads_fornecedores.opt_out = true THEN admin_leads_fornecedores.email_institucional_fonte
        ELSE EXCLUDED.email_institucional_fonte
      END,
      telefone_comercial = CASE
        WHEN admin_leads_fornecedores.opt_out = true THEN admin_leads_fornecedores.telefone_comercial
        ELSE EXCLUDED.telefone_comercial
      END,
      telefone_fonte = CASE
        WHEN admin_leads_fornecedores.opt_out = true THEN admin_leads_fornecedores.telefone_fonte
        ELSE EXCLUDED.telefone_fonte
      END,
      total_licitacoes_participadas_12m = EXCLUDED.total_licitacoes_participadas_12m,
      total_licitacoes_participadas_total = EXCLUDED.total_licitacoes_participadas_total,
      total_licitacoes_ganhas_12m = EXCLUDED.total_licitacoes_ganhas_12m,
      total_licitacoes_ganhas_total = EXCLUDED.total_licitacoes_ganhas_total,
      taxa_conversao_vitoria = EXCLUDED.taxa_conversao_vitoria,
      valor_total_contratos_ganhos_12m = EXCLUDED.valor_total_contratos_ganhos_12m,
      valor_total_contratos_ganhos_total = EXCLUDED.valor_total_contratos_ganhos_total,
      ticket_medio_contratos = EXCLUDED.ticket_medio_contratos,
      maior_contrato_valor = EXCLUDED.maior_contrato_valor,
      orgaos_compradores_distintos_12m = EXCLUDED.orgaos_compradores_distintos_12m,
      orgaos_compradores_lista = EXCLUDED.orgaos_compradores_lista,
      esferas_atuacao = EXCLUDED.esferas_atuacao,
      ultima_participacao_data = EXCLUDED.ultima_participacao_data,
      dias_desde_ultima_participacao = EXCLUDED.dias_desde_ultima_participacao,
      licitacoes_perdidas_por_pouco = EXCLUDED.licitacoes_perdidas_por_pouco,
      diversidade_cnae_editais = EXCLUDED.diversidade_cnae_editais,
      status_ceis = EXCLUDED.status_ceis,
      status_cnep = EXCLUDED.status_cnep,
      status_cepim = EXCLUDED.status_cepim,
      esta_limpo = EXCLUDED.esta_limpo,
      data_ultima_verificacao_sancoes = EXCLUDED.data_ultima_verificacao_sancoes,
      score_fit_licitagram = EXCLUDED.score_fit_licitagram,
      plano_recomendado = EXCLUDED.plano_recomendado,
      segmento_vertical = EXCLUDED.segmento_vertical,
      prioridade_outreach = EXCLUDED.prioridade_outreach,
      motivo_qualificacao = EXCLUDED.motivo_qualificacao,
      ja_e_cliente_licitagram = EXCLUDED.ja_e_cliente_licitagram,
      bloqueado_disparo = EXCLUDED.bloqueado_disparo,
      motivo_bloqueio = EXCLUDED.motivo_bloqueio,
      versao_score = EXCLUDED.versao_score,
      atualizado_em = now()
  `

  try {
    await localPool.query(sql, params)
  } catch (err) {
    logger.error({ err, tuples: valueTuples.length }, 'Erro no UPSERT batch')
    throw err
  }
}

// ─── Ensure table exists ────────────────────────────────────

async function ensureLeadTableExists() {
  try {
    await localPool.query('SELECT 1 FROM admin_leads_fornecedores LIMIT 0')
  } catch {
    logger.info('Tabela admin_leads_fornecedores não encontrada, criando...')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const migrationPath = path.join(__dirname, 'migrations', '001_admin_leads_fornecedores.sql')
    const sql = fs.readFileSync(migrationPath, 'utf-8')
    await localPool.query(sql)
    logger.info('✅ Tabela criada com sucesso')
  }
}

// ─── Audit log ──────────────────────────────────────────────

async function logAudit(acao: string, cnpj: string | null, detalhes: Record<string, unknown>) {
  try {
    await localPool.query(
      `INSERT INTO admin_leads_audit_log (acao, admin_email, detalhes, cnpj_afetado, total_afetados, criado_em)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [acao, 'system', JSON.stringify(detalhes), cnpj, detalhes.totalProcessado || null]
    )
  } catch (err) {
    logger.warn({ err }, 'Falha ao gravar audit log (non-fatal)')
  }
}

// ─── CLI runner (for manual/dry-run execution) ──────────────

if (require.main === module) {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitArg = args.find(a => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined

  populateLeads({ dryRun, limit })
    .then(metrics => {
      console.log('\n📊 Resultado da população:')
      console.log(JSON.stringify(metrics, null, 2))
      process.exit(0)
    })
    .catch(err => {
      console.error('❌ Erro:', err)
      process.exit(1)
    })
}
