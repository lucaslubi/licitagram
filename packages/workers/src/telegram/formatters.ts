import { InlineKeyboard } from 'grammy'
import { formatCurrency, formatDate, truncate } from '@licitagram/shared'

interface MatchAlert {
  matchId: string
  score: number
  breakdown: Array<{ category: string; score: number; reason: string }>
  justificativa: string
  recomendacao?: string
  tender: {
    objeto: string
    orgao_nome: string
    uf: string
    valor_estimado: number | null
    data_abertura: string | null
    modalidade_nome: string | null
    pncp_id?: string | null
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  compatibilidade_cnae: '🏭 CNAE',
  compatibilidade_objeto: '🎯 Objeto',
  qualificacao_tecnica: '🔧 Técnica',
  capacidade_economica: '💰 Econômica',
  documentacao: '📄 Documentação',
  localizacao: '📍 Localização',
  potencial_participacao: '🤝 Participação',
  relevancia_estrategica: '📈 Estratégica',
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

function scoreEmoji(score: number): string {
  if (score >= 80) return '🟢'
  if (score >= 60) return '🟡'
  return '🔴'
}

/** Escape special characters for Telegram HTML parse mode */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function formatMatchAlert(data: MatchAlert): { text: string; keyboard: InlineKeyboard } {
  const { matchId, score, breakdown, justificativa, recomendacao, tender } = data

  // Recommendation emoji
  const recEmoji = recomendacao === 'participar' ? '✅ PARTICIPAR' :
    recomendacao === 'nao_recomendado' ? '⛔ NÃO RECOMENDADO' : '🔎 AVALIAR'

  let text = `${scoreEmoji(score)} <b>Nova Oportunidade - Score ${score}/100</b>\n`
  text += `📌 ${recEmoji}\n\n`
  text += `<b>Objeto:</b> ${escapeHtml(truncate(tender.objeto, 200))}\n`
  text += `<b>Órgão:</b> ${escapeHtml(tender.orgao_nome)}\n`
  text += `<b>UF:</b> ${tender.uf}\n`

  if (tender.valor_estimado) {
    text += `<b>Valor:</b> ${escapeHtml(formatCurrency(tender.valor_estimado))}\n`
  }
  if (tender.modalidade_nome) {
    text += `<b>Modalidade:</b> ${escapeHtml(tender.modalidade_nome)}\n`
  }
  if (tender.data_abertura) {
    const aberturaDate = new Date(tender.data_abertura)
    const now = new Date()
    const diffDays = Math.ceil((aberturaDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const countdown = diffDays > 0 ? ` (${diffDays} dias restantes)` : diffDays === 0 ? ' (HOJE)' : ''
    text += `<b>⏰ Abertura:</b> ${escapeHtml(formatDate(tender.data_abertura))}${countdown}\n`
  }

  // Inline breakdown
  if (breakdown.length > 0) {
    text += `\n<b>📊 Match por Categoria:</b>\n`
    for (const item of breakdown) {
      const label = CATEGORY_LABELS[item.category] || item.category.replace(/_/g, ' ')
      text += `${escapeHtml(label)}: ${scoreBar(item.score)} ${item.score}\n`
    }
  }

  text += `\n<b>Parecer:</b> ${escapeHtml(truncate(justificativa || 'Análise por palavras-chave', 300))}\n`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  const keyboard = new InlineKeyboard()
    .url('📋 Ver Detalhes', `${appUrl}/opportunities/${matchId}`)

  // Add PNCP link if available
  if (tender.pncp_id && !tender.pncp_id.startsWith('comprasgov-') && !tender.pncp_id.startsWith('bec-sp-')) {
    const pncpUrl = `https://pncp.gov.br/app/editais/${tender.pncp_id.replace(/-/g, '/')}`
    keyboard.url('📄 Ver Edital', pncpUrl)
  }

  keyboard.row()
    .text('✅ Tenho Interesse', `match_interested_${matchId}`)
    .text('❌ Descartar', `match_dismiss_${matchId}`)

  return { text, keyboard }
}
