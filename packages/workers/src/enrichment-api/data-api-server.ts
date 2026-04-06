/**
 * Enrichment API Server — runs on VPS2 (85.31.60.53:3998)
 *
 * Endpoints:
 *   GET /api/empresa/:cnpj   — Empresa data from local PostgreSQL
 *   GET /api/socios/:cnpj    — Socios from local PostgreSQL
 *   GET /api/sancoes/:cnpj   — Sanctions from sancoes table
 *   GET /api/grafo/:cnpj     — Societal graph (1-2 depth, LIMIT 50)
 *
 * Deploy: copy to /opt/data-api/ on VPS2, run with pm2/node
 */
import 'dotenv/config'
import http from 'node:http'
import pg from 'pg'
import pino from 'pino'
import {
  handleListLeads,
  handleLeadDetail,
  handleLeadDashboard,
  handleExportCsv,
  handleOptOut,
} from '../lead-engine/lead-api-routes'

const logger = pino({ name: 'data-api-server', level: process.env.LOG_LEVEL || 'info' })

const PORT = Number(process.env.DATA_API_PORT) || 3998

const pgPool = new pg.Pool({
  host: process.env.PG_HOST || '127.0.0.1',
  port: Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'licitagram_data',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatCnpj14(cnpj: string): string {
  return cnpj.replace(/\D/g, '').padStart(14, '0')
}

function jsonResponse(res: http.ServerResponse, statusCode: number, data: unknown) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

function parseUrl(url: string): { pathname: string; query: Record<string, string> } {
  const parsed = new URL(url, 'http://localhost')
  const query: Record<string, string> = {}
  parsed.searchParams.forEach((v, k) => { query[k] = v })
  return { pathname: parsed.pathname, query }
}

// ─── Route Handlers ─────────────────────────────────────────────────────────

async function handleEmpresa(cnpj: string): Promise<{ status: number; body: unknown }> {
  const cnpj14 = formatCnpj14(cnpj)

  const result = await pgPool.query(
    `SELECT
      cnpj,
      razao_social,
      nome_fantasia,
      cnae_fiscal,
      descricao_cnae_principal,
      cnae_fiscal_secundaria,
      porte_empresa,
      capital_social,
      data_inicio_atividade,
      natureza_juridica,
      situacao_cadastral,
      data_situacao_cadastral,
      motivo_situacao_cadastral,
      uf,
      municipio,
      logradouro,
      numero,
      complemento,
      bairro,
      cep,
      ddd_1,
      telefone_1,
      email
    FROM empresas
    WHERE cnpj = $1
    LIMIT 1`,
    [cnpj14],
  )

  if (result.rows.length === 0) {
    return { status: 404, body: { error: 'CNPJ not found' } }
  }

  return { status: 200, body: result.rows[0] }
}

async function handleSocios(cnpj: string): Promise<{ status: number; body: unknown }> {
  const cnpj14 = formatCnpj14(cnpj)

  const result = await pgPool.query(
    `SELECT
      nome_socio,
      cnpj_cpf_socio,
      codigo_qualificacao_socio,
      data_entrada_sociedade,
      faixa_etaria
    FROM socios
    WHERE cnpj = $1
    ORDER BY data_entrada_sociedade DESC`,
    [cnpj14],
  )

  return {
    status: 200,
    body: {
      cnpj: cnpj14,
      socios: result.rows,
      total: result.rows.length,
    },
  }
}

async function handleSancoes(cnpj: string): Promise<{ status: number; body: unknown }> {
  const cnpj14 = formatCnpj14(cnpj)

  const result = await pgPool.query(
    `SELECT
      tipo_sancao,
      orgao_sancionador,
      data_inicio,
      data_fim,
      fundamentacao_legal,
      descricao
    FROM sancoes
    WHERE cnpj = $1
    ORDER BY data_inicio DESC`,
    [cnpj14],
  )

  return {
    status: 200,
    body: {
      cnpj: cnpj14,
      sancionado: result.rows.length > 0,
      sancoes: result.rows,
      total: result.rows.length,
    },
  }
}

async function handleGrafo(cnpj: string, depth: number): Promise<{ status: number; body: unknown }> {
  const cnpj14 = formatCnpj14(cnpj)
  const safeDepth = Math.min(Math.max(depth, 1), 2) // clamp to 1-2

  // Depth 1: get socios of this CNPJ
  const sociosResult = await pgPool.query(
    `SELECT nome_socio, cnpj_cpf_socio, codigo_qualificacao_socio
     FROM socios WHERE cnpj = $1`,
    [cnpj14],
  )

  interface GrafoNode {
    id: string
    label: string
    type: 'empresa' | 'socio'
  }
  interface GrafoEdge {
    from: string
    to: string
    relationship: string
  }

  const nodes: GrafoNode[] = [{ id: cnpj14, label: cnpj14, type: 'empresa' }]
  const edges: GrafoEdge[] = []
  const visitedSocios = new Set<string>()

  for (const s of sociosResult.rows) {
    const socioId = s.cnpj_cpf_socio || s.nome_socio
    if (!socioId || visitedSocios.has(socioId)) continue
    visitedSocios.add(socioId)

    nodes.push({ id: socioId, label: s.nome_socio || socioId, type: 'socio' })
    edges.push({ from: socioId, to: cnpj14, relationship: s.codigo_qualificacao_socio || 'socio' })
  }

  // Depth 2: find other companies where these socios appear
  if (safeDepth >= 2 && visitedSocios.size > 0) {
    const socioIds = Array.from(visitedSocios)
    const relatedResult = await pgPool.query(
      `SELECT DISTINCT s.cnpj, s.nome_socio, s.cnpj_cpf_socio, e.razao_social
       FROM socios s
       LEFT JOIN empresas e ON e.cnpj = s.cnpj
       WHERE (s.cnpj_cpf_socio = ANY($1) OR s.nome_socio = ANY($1))
         AND s.cnpj != $2
       LIMIT 50`,
      [socioIds, cnpj14],
    )

    const visitedEmpresas = new Set<string>([cnpj14])
    for (const row of relatedResult.rows) {
      if (!visitedEmpresas.has(row.cnpj)) {
        visitedEmpresas.add(row.cnpj)
        nodes.push({
          id: row.cnpj,
          label: row.razao_social || row.cnpj,
          type: 'empresa',
        })
      }

      const socioId = row.cnpj_cpf_socio || row.nome_socio
      if (socioId) {
        edges.push({ from: socioId, to: row.cnpj, relationship: 'socio' })
      }
    }
  }

  return {
    status: 200,
    body: {
      cnpj: cnpj14,
      depth: safeDepth,
      nodes,
      edges,
      total_nodes: nodes.length,
      total_edges: edges.length,
    },
  }
}

// ─── Batch Handlers (POST) ──────────────────────────────────────────────────

async function handleBatchSocios(cnpjs: string[]): Promise<{ status: number; body: unknown }> {
  const cnpjs14 = cnpjs.map(c => formatCnpj14(c)).slice(0, 100) // max 100 CNPJs per batch

  const result = await pgPool.query(
    `SELECT cnpj, nome_socio, cnpj_cpf_socio, codigo_qualificacao_socio
     FROM socios WHERE cnpj = ANY($1) ORDER BY cnpj, nome_socio`,
    [cnpjs14],
  )

  // Group by CNPJ
  const grouped: Record<string, Array<{ nome_socio: string; cnpj_cpf_socio: string }>> = {}
  for (const row of result.rows) {
    if (!grouped[row.cnpj]) grouped[row.cnpj] = []
    grouped[row.cnpj].push({ nome_socio: row.nome_socio, cnpj_cpf_socio: row.cnpj_cpf_socio })
  }

  return { status: 200, body: { results: grouped, total: result.rows.length } }
}

async function handleBatchEmpresas(cnpjs: string[]): Promise<{ status: number; body: unknown }> {
  const cnpjs14 = cnpjs.map(c => formatCnpj14(c)).slice(0, 100)

  const result = await pgPool.query(
    `SELECT cnpj, razao_social, capital_social, data_inicio_atividade, logradouro, numero, municipio, uf
     FROM empresas WHERE cnpj = ANY($1)`,
    [cnpjs14],
  )

  const grouped: Record<string, any> = {}
  for (const row of result.rows) {
    grouped[row.cnpj] = row
  }

  return { status: 200, body: { results: grouped, total: result.rows.length } }
}

async function handleBatchSancoes(cnpjs: string[]): Promise<{ status: number; body: unknown }> {
  const cnpjs14 = cnpjs.map(c => formatCnpj14(c)).slice(0, 100)

  const result = await pgPool.query(
    `SELECT cnpj, tipo_sancao, orgao_sancionador, data_inicio, data_fim
     FROM sancoes WHERE cnpj = ANY($1)`,
    [cnpjs14],
  )

  const grouped: Record<string, any[]> = {}
  for (const row of result.rows) {
    if (!grouped[row.cnpj]) grouped[row.cnpj] = []
    grouped[row.cnpj].push(row)
  }

  return { status: 200, body: { results: grouped, total: result.rows.length } }
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// ─── Server ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    jsonResponse(res, 204, '')
    return
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    jsonResponse(res, 405, { error: 'Method not allowed' })
    return
  }

  const { pathname, query } = parseUrl(req.url || '/')

  try {
    // Route: GET /api/empresa/:cnpj
    const empresaMatch = pathname.match(/^\/api\/empresa\/(\d{11,14})$/)
    if (empresaMatch) {
      const result = await handleEmpresa(empresaMatch[1])
      jsonResponse(res, result.status, result.body)
      return
    }

    // Route: GET /api/socios/:cnpj
    const sociosMatch = pathname.match(/^\/api\/socios\/(\d{11,14})$/)
    if (sociosMatch) {
      const result = await handleSocios(sociosMatch[1])
      jsonResponse(res, result.status, result.body)
      return
    }

    // Route: GET /api/sancoes/:cnpj
    const sancoesMatch = pathname.match(/^\/api\/sancoes\/(\d{11,14})$/)
    if (sancoesMatch) {
      const result = await handleSancoes(sancoesMatch[1])
      jsonResponse(res, result.status, result.body)
      return
    }

    // Route: GET /api/grafo/:cnpj
    const grafoMatch = pathname.match(/^\/api\/grafo\/(\d{11,14})$/)
    if (grafoMatch) {
      const depth = Number(query.depth) || 1
      const result = await handleGrafo(grafoMatch[1], depth)
      jsonResponse(res, result.status, result.body)
      return
    }

    // ─── POST batch endpoints ────────────────────────────────────────
    if (req.method === 'POST') {
      const body = await readBody(req)
      let parsed: { cnpjs?: string[] }
      try {
        parsed = JSON.parse(body)
      } catch {
        jsonResponse(res, 400, { error: 'Invalid JSON' })
        return
      }

      if (!parsed.cnpjs || !Array.isArray(parsed.cnpjs) || parsed.cnpjs.length === 0) {
        jsonResponse(res, 400, { error: 'cnpjs array required' })
        return
      }

      if (pathname === '/api/batch/socios') {
        const result = await handleBatchSocios(parsed.cnpjs)
        jsonResponse(res, result.status, result.body)
        return
      }
      if (pathname === '/api/batch/empresas') {
        const result = await handleBatchEmpresas(parsed.cnpjs)
        jsonResponse(res, result.status, result.body)
        return
      }
      if (pathname === '/api/batch/sancoes') {
        const result = await handleBatchSancoes(parsed.cnpjs)
        jsonResponse(res, result.status, result.body)
        return
      }
    }

    // ─── Lead Engine routes ───────────────────────────────────────
    // GET /api/leads/dashboard — Dashboard métricas
    if (pathname === '/api/leads/dashboard' && req.method === 'GET') {
      const result = await handleLeadDashboard(pgPool)
      jsonResponse(res, result.status, result.body)
      return
    }

    // GET /api/leads/:cnpj — Detalhe de lead
    const leadDetailMatch = pathname.match(/^\/api\/leads\/(\d{11,14})$/)
    if (leadDetailMatch && req.method === 'GET') {
      const result = await handleLeadDetail(pgPool, leadDetailMatch[1])
      jsonResponse(res, result.status, result.body)
      return
    }

    // GET /api/leads — Lista paginada
    if (pathname === '/api/leads' && req.method === 'GET') {
      const result = await handleListLeads(pgPool, query)
      jsonResponse(res, result.status, result.body)
      return
    }

    // POST /api/leads/export — Export CSV
    if (pathname === '/api/leads/export' && req.method === 'POST') {
      const body = await readBody(req)
      let parsed: any
      try { parsed = JSON.parse(body) } catch {
        jsonResponse(res, 400, { error: 'Invalid JSON' })
        return
      }
      if (!parsed.adminEmail) {
        jsonResponse(res, 400, { error: 'adminEmail required' })
        return
      }
      await handleExportCsv(pgPool, res, parsed)
      return
    }

    // GET /api/leads/optout — Opt-out LGPD
    if (pathname === '/api/leads/optout' && req.method === 'GET') {
      const cnpj = query.cnpj
      const token = query.token
      const origem = query.origem
      if (!cnpj || !token) {
        jsonResponse(res, 400, { error: 'cnpj and token required' })
        return
      }
      const result = await handleOptOut(pgPool, cnpj, token, origem)
      res.writeHead(result.status, { 'Content-Type': result.contentType })
      res.end(result.body)
      return
    }

    // Health check
    if (pathname === '/health' || pathname === '/') {
      jsonResponse(res, 200, { status: 'ok', timestamp: new Date().toISOString() })
      return
    }

    jsonResponse(res, 404, { error: 'Not found' })
  } catch (err) {
    logger.error({ err, pathname }, 'Request error')
    jsonResponse(res, 500, { error: 'Internal server error' })
  }
})

// ─── Start ──────────────────────────────────────────────────────────────────
async function main() {
  // Verify PostgreSQL connection
  try {
    const result = await pgPool.query('SELECT COUNT(*) as count FROM empresas LIMIT 1')
    logger.info({ empresas: result.rows[0]?.count }, 'PostgreSQL connection verified')
  } catch (err) {
    logger.fatal({ err }, 'Cannot connect to PostgreSQL')
    process.exit(1)
  }

  server.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'Data API server started')
  })
}

main().catch(err => {
  logger.fatal({ err }, 'Data API server crashed')
  process.exit(1)
})
