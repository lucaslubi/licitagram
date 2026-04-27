/**
 * Pure helpers for building outbound prospecting messages.
 * Imported both by the personalize processor and the dry-run pilot script,
 * so this file MUST NOT instantiate any BullMQ Worker / Queue at module load.
 */
import { supabase } from './supabase'
import { logger } from './logger'

export interface TenderRow {
  objeto: string
  orgao_nome: string
  valor_estimado: number | null
  uf: string | null
  modalidade_nome: string | null
}

export const fmtBRL = (v: number | null | undefined) =>
  v != null
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
    : 'valor sob consulta'

export const fmtN = (v: number | null | undefined) =>
  v != null ? new Intl.NumberFormat('pt-BR').format(v) : '0'

export function firstName(razao: string): string {
  const cleaned = razao
    .replace(/\b(LTDA|S\.?A\.?|EIRELI|MEI|EPP|ME)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const words = cleaned.split(' ').slice(0, 2).join(' ')
  return words.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export function truncate(s: string, n: number): string {
  if (!s) return ''
  if (s.length <= n) return s
  return s.slice(0, n - 1).trimEnd() + '…'
}

/**
 * Top 3 open tenders matching the lead's CNAE division.
 * `cnae_classificados` in `tenders` stores 2-digit CNAE divisions.
 */
export async function fetchOpportunities(
  cnaeCode: string | null,
  uf: string | null,
): Promise<TenderRow[]> {
  if (!cnaeCode) return []
  const cnae2 = String(cnaeCode).replace(/\D/g, '').slice(0, 2)
  if (cnae2.length < 2) return []

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

export function buildMessage(opts: {
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

  return [
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
  ].join('\n')
}
