/**
 * Outbound Personalize Processor
 *
 * Pega 1 lead da campanha → busca top 3 oportunidades reais (tenders abertos
 * com CNAE compatível) → monta mensagem cold-intro → grava em
 * `outbound_messages` (status='queued') → enfileira no `outbound-whatsapp`
 * worker.
 *
 * Não envia nada por aqui — só prepara. Throughput pode ser alto (concurrency 4).
 */
import { Worker } from 'bullmq'
import { connection } from '../queues/connection'
import type { OutboundPersonalizeJobData } from '../queues/outbound-personalize.queue'
import { outboundWhatsappQueue } from '../queues/outbound-whatsapp.queue'
import { supabase } from '../lib/supabase'
import { localPool } from '../lib/local-db'
import { logger } from '../lib/logger'
import { normalizeBrPhone } from '../lib/phone'

interface TenderRow {
  objeto: string
  orgao_nome: string
  valor_estimado: number | null
  uf: string | null
  modalidade_nome: string | null
}

const fmtBRL = (v: number | null | undefined) =>
  v != null
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
    : 'valor sob consulta'

const fmtN = (v: number | null | undefined) =>
  v != null ? new Intl.NumberFormat('pt-BR').format(v) : '0'

function firstName(razao: string): string {
  // "EMPRESA EXEMPLO LTDA" → "Empresa Exemplo"
  const cleaned = razao
    .replace(/\b(LTDA|S\.?A\.?|EIRELI|MEI|EPP|ME)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const words = cleaned.split(' ').slice(0, 2).join(' ')
  return (
    words
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  if (s.length <= n) return s
  return s.slice(0, n - 1).trimEnd() + '…'
}

/**
 * Busca top 3 tenders abertos compatíveis com CNAE do lead.
 * cnae_classificados é array de strings 2-dígito (divisão CNAE), ex ['33','62'].
 */
async function fetchOpportunities(cnaeCode: string | null, uf: string | null): Promise<TenderRow[]> {
  if (!cnaeCode) return []
  const cnae2 = String(cnaeCode).replace(/\D/g, '').slice(0, 2)
  if (cnae2.length < 2) return []

  // First try with UF preference, then fall back to nationwide
  const tryQuery = async (filterUf: string | null) => {
    let query = supabase
      .from('tenders')
      .select('objeto, orgao_nome, valor_estimado, uf, modalidade_nome, data_abertura, data_publicacao')
      .contains('cnae_classificados', [cnae2])
      .gte('data_abertura', new Date().toISOString())
      .not('modalidade_nome', 'in', '("Inexigibilidade","Credenciamento","Dispensa")')
      .order('data_publicacao', { ascending: false })
      .limit(3)
    if (filterUf) query = query.eq('uf', filterUf)
    const { data, error } = await query
    if (error) {
      logger.warn({ err: error.message, cnae2, filterUf }, 'fetchOpportunities query failed')
      return []
    }
    return (data ?? []) as TenderRow[]
  }

  let rows = uf ? await tryQuery(uf) : []
  if (rows.length < 3) {
    const more = await tryQuery(null)
    // Dedupe by objeto+orgao
    const seen = new Set(rows.map((r) => `${r.orgao_nome}|${r.objeto}`))
    for (const r of more) {
      const k = `${r.orgao_nome}|${r.objeto}`
      if (!seen.has(k)) {
        rows.push(r)
        seen.add(k)
      }
      if (rows.length >= 3) break
    }
  }
  return rows.slice(0, 3)
}

function buildMessage(opts: {
  leadRazaoSocial: string
  leadTotalGanhas: number | null
  leadValorTotal: number | null
  opportunities: TenderRow[]
}): string {
  const nome = firstName(opts.leadRazaoSocial)
  const ganhas = opts.leadTotalGanhas ?? 0
  const valorTotal = opts.leadValorTotal ?? 0
  const ehProvado = ganhas > 0

  const intro = ehProvado
    ? `Oi! Vi que a *${nome}* já participou de licitações públicas e ganhou ${fmtN(ganhas)} contratos somando ${fmtBRL(valorTotal)}.`
    : `Oi! Estou olhando empresas do setor da *${nome}* que aparecem em licitações públicas.`

  const oppsLines = opts.opportunities.map((t, i) => {
    const obj = truncate(t.objeto || '', 80)
    const orgao = truncate(t.orgao_nome || '', 40)
    const uf = t.uf || '—'
    const valor = fmtBRL(t.valor_estimado)
    return `${i + 1}. ${obj} — ${valor} (${orgao}, ${uf})`
  })

  const lines: string[] = [
    intro,
    '',
    `Encontrei ${opts.opportunities.length} oportunidades abertas AGORA pro seu setor:`,
    '',
    ...oppsLines,
    '',
    'Sou da *Licitagram* — uma plataforma com IA que monitora 250 mil+ licitações em tempo real e manda só o que faz sentido pro seu CNPJ.',
    '',
    `Quer que eu te mostre as outras oportunidades disponíveis pra ${nome}? Posso liberar 7 dias de teste, sem cartão.`,
    '',
    '_Se preferir não receber mais mensagens, responda PARAR._',
    '',
    '— Equipe Licitagram',
  ]
  return lines.join('\n')
}

const outboundPersonalizeWorker = new Worker<OutboundPersonalizeJobData>(
  'outbound-personalize',
  async (job) => {
    const data = job.data
    const log = logger.child({ jobId: job.id, cnpj: data.leadCnpj.slice(0, 8) + 'xxxxxx' })

    // 1. Normalize phone
    const phone = normalizeBrPhone(data.leadTelefone)
    if (!phone) {
      log.warn({ raw: data.leadTelefone?.slice(0, 4) + '***' }, 'Invalid phone — skipping')
      return { skipped: true, reason: 'invalid_phone' }
    }

    // 2. Skip if already in opt-out list (cnpj or whatsapp)
    const { data: optOuts } = await supabase
      .from('outbound_optouts')
      .select('id')
      .or(`cnpj.eq.${data.leadCnpj},whatsapp.eq.${phone}`)
      .limit(1)
    if (optOuts && optOuts.length > 0) {
      log.info('Lead opted out — skipping')
      return { skipped: true, reason: 'opted_out' }
    }

    // 3. Skip if we already messaged this CNPJ in this campaign (idempotency)
    const { data: existing } = await supabase
      .from('outbound_messages')
      .select('id')
      .eq('lead_cnpj', data.leadCnpj)
      .eq('campaign_id', data.campaignId)
      .limit(1)
    if (existing && existing.length > 0) {
      log.info('Already queued for this campaign — skipping')
      return { skipped: true, reason: 'already_queued' }
    }

    // 4. Fetch real opportunities
    const opportunities = await fetchOpportunities(data.leadCnae, data.leadUf)
    if (opportunities.length === 0) {
      log.info({ cnae: data.leadCnae }, 'No opportunities — recording rejection')
      await supabase.from('outbound_messages').insert({
        lead_id: data.leadId ?? null,
        lead_cnpj: data.leadCnpj,
        channel: 'whatsapp',
        template_name: data.template,
        campaign_id: data.campaignId,
        to_address: phone,
        message_body: '(no opportunities available — message not sent)',
        status: 'failed',
        failed_at: new Date().toISOString(),
        error_message: 'no_opportunities',
        metadata: { reason: 'no_opportunities', cnae: data.leadCnae, uf: data.leadUf },
      })
      return { skipped: true, reason: 'no_opportunities' }
    }

    // 5. Build message
    const body = buildMessage({
      leadRazaoSocial: data.leadRazaoSocial,
      leadTotalGanhas: data.leadTotalGanhas,
      leadValorTotal: data.leadValorTotal,
      opportunities,
    })

    // 6. Insert outbound_messages row
    const { data: inserted, error: insertErr } = await supabase
      .from('outbound_messages')
      .insert({
        lead_id: data.leadId ?? null,
        lead_cnpj: data.leadCnpj,
        channel: 'whatsapp',
        template_name: data.template,
        campaign_id: data.campaignId,
        to_address: phone,
        message_body: body,
        status: 'queued',
        metadata: {
          opportunities_count: opportunities.length,
          lead_uf: data.leadUf,
          lead_cnae: data.leadCnae,
        },
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      log.error({ err: insertErr?.message }, 'Failed to insert outbound_messages row')
      throw new Error(`insert failed: ${insertErr?.message}`)
    }

    // 7. Enqueue send job — jitter incremental (8-25 min) pra spread natural anti-ban.
    // Mesmo com daily cap + limiter, isso evita "rajada" de N msgs esperando o limiter na mesma hora.
    const jitterMs = (8 + Math.random() * 17) * 60 * 1000
    await outboundWhatsappQueue.add(
      'send',
      { outboundMessageId: inserted.id },
      { jobId: `send-${inserted.id}`, delay: Math.round(jitterMs) },
    )

    log.info(
      { messageId: inserted.id, opps: opportunities.length, sendDelayMin: Math.round(jitterMs / 60000) },
      'Personalized + queued',
    )
    return { messageId: inserted.id, opps: opportunities.length }
  },
  {
    connection,
    concurrency: 4,
    lockDuration: 60_000,
  },
)

outboundPersonalizeWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'outbound-personalize job failed')
})

export { outboundPersonalizeWorker }

// Export internal helpers for dry-run script
export const __testing = { fetchOpportunities, buildMessage, firstName }

// Suppress "imported but unused" warning for localPool in case we add direct PG queries later
void localPool
