/**
 * Lead Engine — API Routes para o Data API Server (VPS2)
 *
 * Estes handlers são montados no data-api-server.ts existente
 * para servir dados de leads ao frontend admin via HTTP.
 *
 * Endpoints:
 *   GET  /api/leads                  — Lista paginada com filtros
 *   GET  /api/leads/:cnpj            — Detalhe de um lead
 *   GET  /api/leads/dashboard        — Métricas do dashboard
 *   POST /api/leads/export           — Export CSV (streamed)
 *   POST /api/leads/:cnpj/optout     — Marca opt-out LGPD
 *   POST /api/leads/:cnpj/action     — Ações (bloquear, reprocessar)
 */

import type http from 'node:http'
import type pg from 'pg'
import crypto from 'node:crypto'

const OPT_OUT_SECRET = process.env.LEAD_OPT_OUT_SECRET || 'licitagram-leads-optout-2026'
const MAX_EXPORT_PER_REQUEST = Number(process.env.MAX_LEADS_EXPORT) || 5000

// ─── HMAC for opt-out links ─────────────────────────────────

export function generateOptOutToken(cnpj: string): string {
  return crypto
    .createHmac('sha256', OPT_OUT_SECRET)
    .update(cnpj)
    .digest('hex')
}

export function verifyOptOutToken(cnpj: string, token: string): boolean {
  const expected = generateOptOutToken(cnpj)
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}

// ─── List leads (GET /api/leads) ────────────────────────────

export async function handleListLeads(
  pool: pg.Pool,
  query: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const page = Math.max(1, parseInt(query.page || '1'))
  const pageSize = Math.min(100, Math.max(10, parseInt(query.pageSize || '50')))
  const offset = (page - 1) * pageSize

  // Build WHERE clauses
  const conditions: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  // Search (razão social or CNPJ)
  if (query.search) {
    conditions.push(`(razao_social ILIKE $${paramIdx} OR cnpj LIKE $${paramIdx + 1})`)
    params.push(`%${query.search}%`, `%${query.search.replace(/\D/g, '')}%`)
    paramIdx += 2
  }

  // UF (comma-separated)
  if (query.uf) {
    const ufs = query.uf.split(',').map(u => u.trim().toUpperCase()).filter(Boolean)
    if (ufs.length > 0) {
      conditions.push(`uf = ANY($${paramIdx})`)
      params.push(ufs)
      paramIdx++
    }
  }

  // CNAE
  if (query.cnae) {
    conditions.push(`cnae_principal_codigo LIKE $${paramIdx}`)
    params.push(`${query.cnae}%`)
    paramIdx++
  }

  // Segmento vertical
  if (query.segmento) {
    const segs = query.segmento.split(',').filter(Boolean)
    conditions.push(`segmento_vertical = ANY($${paramIdx})`)
    params.push(segs)
    paramIdx++
  }

  // Score mínimo
  if (query.scoreMin) {
    conditions.push(`score_fit_licitagram >= $${paramIdx}`)
    params.push(parseInt(query.scoreMin))
    paramIdx++
  }

  // Plano recomendado
  if (query.plano) {
    const planos = query.plano.split(',').filter(Boolean)
    conditions.push(`plano_recomendado = ANY($${paramIdx}::plano_recomendado_enum[])`)
    params.push(planos)
    paramIdx++
  }

  // Prioridade
  if (query.prioridade) {
    const prios = query.prioridade.split(',').filter(Boolean)
    conditions.push(`prioridade_outreach = ANY($${paramIdx}::prioridade_outreach_enum[])`)
    params.push(prios)
    paramIdx++
  }

  // Somente com email
  if (query.comEmail === 'true') {
    conditions.push('email_institucional_generico IS NOT NULL')
  }

  // Somente com site
  if (query.comSite === 'true') {
    conditions.push('site_institucional IS NOT NULL')
  }

  // Excluir já contactados (default true)
  if (query.excluirContactados !== 'false') {
    conditions.push("status_outreach = 'NAO_CONTACTADO'")
  }

  // Ticket médio mínimo
  if (query.ticketMin) {
    conditions.push(`ticket_medio_contratos >= $${paramIdx}`)
    params.push(parseFloat(query.ticketMin))
    paramIdx++
  }

  // Participou nos últimos X dias
  if (query.diasMax) {
    conditions.push(`dias_desde_ultima_participacao <= $${paramIdx}`)
    params.push(parseInt(query.diasMax))
    paramIdx++
  }

  // Somente "perdeu por pouco"
  if (query.perdeuPorPouco === 'true') {
    conditions.push('licitacoes_perdidas_por_pouco > 0')
  }

  // Exclude blocked + opt-out by default for exports (not for listing)
  // Listing shows all — exports will filter

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Sort
  const sortField = query.sort || 'score_fit_licitagram'
  const allowedSorts = [
    'score_fit_licitagram', 'razao_social', 'total_licitacoes_participadas_12m',
    'ticket_medio_contratos', 'ultima_participacao_data', 'total_licitacoes_participadas_total',
    'valor_total_contratos_ganhos_12m', 'licitacoes_perdidas_por_pouco',
  ]
  const safeSortField = allowedSorts.includes(sortField) ? sortField : 'score_fit_licitagram'
  const sortOrder = query.order === 'asc' ? 'ASC' : 'DESC'

  // Count total
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM admin_leads_fornecedores ${whereClause}`,
    params,
  )
  const total = parseInt(countResult.rows[0]?.total || '0')

  // Fetch page
  const dataResult = await pool.query(
    `SELECT
      id, cnpj, razao_social, nome_fantasia, uf, municipio,
      cnae_principal_codigo, cnae_principal_descricao, segmento_vertical,
      porte, score_fit_licitagram, plano_recomendado, prioridade_outreach,
      total_licitacoes_participadas_12m, total_licitacoes_participadas_total,
      total_licitacoes_ganhas_12m, total_licitacoes_ganhas_total,
      ticket_medio_contratos, valor_total_contratos_ganhos_12m,
      ultima_participacao_data, dias_desde_ultima_participacao,
      licitacoes_perdidas_por_pouco,
      email_institucional_generico, email_institucional_validado,
      site_institucional, telefone_comercial,
      status_outreach, opt_out, bloqueado_disparo, motivo_bloqueio,
      ja_e_cliente_licitagram, esta_limpo, motivo_qualificacao,
      criado_em, atualizado_em
    FROM admin_leads_fornecedores
    ${whereClause}
    ORDER BY ${safeSortField} ${sortOrder} NULLS LAST
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, pageSize, offset],
  )

  return {
    status: 200,
    body: {
      data: dataResult.rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
  }
}

// ─── Lead detail (GET /api/leads/:cnpj) ─────────────────────

export async function handleLeadDetail(
  pool: pg.Pool,
  cnpj: string,
): Promise<{ status: number; body: unknown }> {
  const cnpj14 = cnpj.replace(/\D/g, '').padStart(14, '0')

  const result = await pool.query(
    'SELECT * FROM admin_leads_fornecedores WHERE cnpj = $1',
    [cnpj14],
  )

  if (result.rows.length === 0) {
    return { status: 404, body: { error: 'Lead não encontrado' } }
  }

  return { status: 200, body: result.rows[0] }
}

// ─── Dashboard metrics (GET /api/leads/dashboard) ───────────

export async function handleLeadDashboard(
  pool: pg.Pool,
): Promise<{ status: number; body: unknown }> {
  const [
    totalResult,
    scoreDistResult,
    planoDistResult,
    ufDistResult,
    segmentoDistResult,
    emailStatsResult,
    outreachFunnelResult,
    prioridadeResult,
  ] = await Promise.all([
    pool.query('SELECT COUNT(*) as total FROM admin_leads_fornecedores'),
    pool.query(`
      SELECT
        CASE
          WHEN score_fit_licitagram >= 80 THEN 'HOT (80-100)'
          WHEN score_fit_licitagram >= 50 THEN 'WARM (50-79)'
          WHEN score_fit_licitagram >= 20 THEN 'COLD (20-49)'
          ELSE 'NAO_DISPARAR (<20)'
        END as faixa,
        COUNT(*) as count
      FROM admin_leads_fornecedores
      GROUP BY faixa ORDER BY faixa
    `),
    pool.query(`
      SELECT plano_recomendado, COUNT(*) as count
      FROM admin_leads_fornecedores
      WHERE bloqueado_disparo = false
      GROUP BY plano_recomendado ORDER BY count DESC
    `),
    pool.query(`
      SELECT uf, COUNT(*) as count, AVG(score_fit_licitagram) as score_medio
      FROM admin_leads_fornecedores
      WHERE uf IS NOT NULL
      GROUP BY uf ORDER BY count DESC LIMIT 27
    `),
    pool.query(`
      SELECT segmento_vertical, COUNT(*) as count,
        AVG(ticket_medio_contratos) as ticket_medio_seg
      FROM admin_leads_fornecedores
      WHERE segmento_vertical IS NOT NULL
      GROUP BY segmento_vertical ORDER BY count DESC LIMIT 20
    `),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE email_institucional_generico IS NOT NULL) as com_email,
        COUNT(*) FILTER (WHERE email_institucional_validado = true) as email_validado,
        COUNT(*) FILTER (WHERE site_institucional IS NOT NULL) as com_site,
        COUNT(*) as total
      FROM admin_leads_fornecedores
      WHERE bloqueado_disparo = false AND opt_out = false
    `),
    pool.query(`
      SELECT status_outreach, COUNT(*) as count
      FROM admin_leads_fornecedores
      GROUP BY status_outreach ORDER BY count DESC
    `),
    pool.query(`
      SELECT prioridade_outreach, COUNT(*) as count
      FROM admin_leads_fornecedores
      WHERE bloqueado_disparo = false AND opt_out = false
      GROUP BY prioridade_outreach ORDER BY count DESC
    `),
  ])

  const emailStats = emailStatsResult.rows[0] || {}

  return {
    status: 200,
    body: {
      total: parseInt(totalResult.rows[0]?.total || '0'),
      distribuicaoScore: scoreDistResult.rows,
      distribuicaoPlano: planoDistResult.rows,
      distribuicaoUf: ufDistResult.rows,
      distribuicaoSegmento: segmentoDistResult.rows,
      emailStats: {
        comEmail: parseInt(emailStats.com_email || '0'),
        emailValidado: parseInt(emailStats.email_validado || '0'),
        comSite: parseInt(emailStats.com_site || '0'),
        totalDisponivel: parseInt(emailStats.total || '0'),
        taxaEnriquecimentoEmail: emailStats.total > 0
          ? (parseInt(emailStats.com_email) / parseInt(emailStats.total) * 100).toFixed(1)
          : '0',
        taxaEnriquecimentoSite: emailStats.total > 0
          ? (parseInt(emailStats.com_site) / parseInt(emailStats.total) * 100).toFixed(1)
          : '0',
      },
      funilOutreach: outreachFunnelResult.rows,
      distribuicaoPrioridade: prioridadeResult.rows,
    },
  }
}

// ─── Export CSV (POST /api/leads/export) ─────────────────────

export async function handleExportCsv(
  pool: pg.Pool,
  res: http.ServerResponse,
  body: {
    filtros: Record<string, string>
    marcarComoFila?: boolean
    adminEmail: string
    adminUserId?: string
  },
): Promise<void> {
  const { filtros, marcarComoFila = false, adminEmail, adminUserId } = body

  // Build filter query (reuse list logic)
  const listResult = await handleListLeads(pool, {
    ...filtros,
    pageSize: String(MAX_EXPORT_PER_REQUEST),
    page: '1',
  })

  const leads = (listResult.body as any).data as any[]
  const total = (listResult.body as any).pagination.total

  // LGPD GUARD: filter out opt_out and bloqueado_disparo
  const exportable = leads.filter((l: any) => !l.opt_out && !l.bloqueado_disparo)
  const bloqueados = leads.length - exportable.length

  // Log blocked attempts
  if (bloqueados > 0) {
    await logAuditExport(pool, 'export_bloqueio_lgpd', adminEmail, {
      totalTentado: leads.length,
      totalBloqueado: bloqueados,
      filtros,
    })
  }

  // CSV headers (Instantly/Smartlead compatible)
  const csvHeaders = [
    'email', 'first_name', 'company_name', 'cnpj', 'uf', 'municipio',
    'cnae', 'score', 'plano_recomendado', 'motivo_qualificacao',
    'licitacoes_12m', 'ticket_medio', 'ultima_participacao',
    'custom_var_1', 'custom_var_2', 'custom_var_3', 'unsubscribe_link',
  ]

  const csvRows = exportable.map((l: any) => {
    const optOutLink = `${process.env.APP_URL || 'https://licitagram.com.br'}/api/leads/optout?cnpj=${l.cnpj}&token=${generateOptOutToken(l.cnpj)}`

    return [
      l.email_institucional_generico || '',
      '', // first_name — vazio (não temos nome pessoal)
      l.razao_social || '',
      l.cnpj,
      l.uf || '',
      l.municipio || '',
      l.cnae_principal_codigo || '',
      l.score_fit_licitagram,
      l.plano_recomendado || '',
      (l.motivo_qualificacao || '').replace(/"/g, '""'), // escape for CSV
      l.total_licitacoes_participadas_12m || 0,
      l.ticket_medio_contratos || 0,
      l.ultima_participacao_data ? new Date(l.ultima_participacao_data).toISOString().split('T')[0] : '',
      '', // custom_var_1 — a ser preenchido por campanha
      '', // custom_var_2
      '', // custom_var_3
      optOutLink,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  })

  const csvContent = [csvHeaders.join(','), ...csvRows].join('\n')
  const hash = crypto.createHash('sha256').update(csvContent).digest('hex')

  // Log export
  await pool.query(
    `INSERT INTO admin_leads_exports (admin_email, admin_user_id, filtros_aplicados, total_leads_exportados, total_leads_bloqueados_lgpd, hash_arquivo, nome_arquivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [adminEmail, adminUserId, JSON.stringify(filtros), exportable.length, bloqueados, hash, `leads_export_${Date.now()}.csv`],
  )

  await logAuditExport(pool, 'export', adminEmail, {
    total: exportable.length,
    bloqueados,
    filtros,
    hash,
  })

  // Mark as FILA if requested
  if (marcarComoFila && exportable.length > 0) {
    const cnpjs = exportable.map((l: any) => l.cnpj)
    await pool.query(
      `UPDATE admin_leads_fornecedores SET status_outreach = 'FILA' WHERE cnpj = ANY($1) AND status_outreach = 'NAO_CONTACTADO'`,
      [cnpjs],
    )
  }

  // Stream CSV response
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="leads_export_${Date.now()}.csv"`,
    'X-Total-Leads': String(exportable.length),
    'X-Total-Blocked-LGPD': String(bloqueados),
  })
  res.end(csvContent)
}

// ─── Opt-out handler ────────────────────────────────────────

export async function handleOptOut(
  pool: pg.Pool,
  cnpj: string,
  token: string,
  origem?: string,
): Promise<{ status: number; body: string; contentType: string }> {
  const cnpj14 = cnpj.replace(/\D/g, '').padStart(14, '0')

  if (!verifyOptOutToken(cnpj14, token)) {
    return {
      status: 403,
      body: '<html><body><h1>Token inválido</h1><p>O link de cancelamento é inválido ou expirou.</p></body></html>',
      contentType: 'text/html; charset=utf-8',
    }
  }

  // Mark opt-out (NEVER delete)
  await pool.query(
    `UPDATE admin_leads_fornecedores
     SET opt_out = true, opt_out_data = now(), opt_out_origem = $2,
         bloqueado_disparo = true, motivo_bloqueio = 'Opt-out LGPD'
     WHERE cnpj = $1`,
    [cnpj14, origem || 'link_email'],
  )

  // Log
  await logAuditExport(pool, 'opt_out', null, { cnpj: cnpj14, origem })

  const dataFormatada = new Date().toLocaleDateString('pt-BR')

  return {
    status: 200,
    body: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Cancelamento confirmado</title>
<style>body{font-family:system-ui;max-width:600px;margin:80px auto;padding:20px;color:#333}h1{color:#059669}</style>
</head>
<body>
<h1>✅ Cancelamento confirmado</h1>
<p>Você foi removido da nossa lista de comunicações comerciais.</p>
<p>Seu pedido foi processado em <strong>${dataFormatada}</strong>.</p>
<p>Sua informação continua no banco apenas para garantir que não receba novos contatos, conforme previsto na LGPD (Lei 13.709/2018).</p>
<p>Se desejar mais informações, entre em contato: <a href="mailto:contato@licitagram.com.br">contato@licitagram.com.br</a></p>
</body></html>`,
    contentType: 'text/html; charset=utf-8',
  }
}

// ─── Audit helper ───────────────────────────────────────────

async function logAuditExport(
  pool: pg.Pool,
  acao: string,
  adminEmail: string | null,
  detalhes: Record<string, unknown>,
) {
  try {
    await pool.query(
      `INSERT INTO admin_leads_audit_log (acao, admin_email, detalhes, total_afetados, criado_em)
       VALUES ($1, $2, $3, $4, now())`,
      [acao, adminEmail, JSON.stringify(detalhes), detalhes.total || detalhes.totalBloqueado || 1],
    )
  } catch { /* non-fatal */ }
}
