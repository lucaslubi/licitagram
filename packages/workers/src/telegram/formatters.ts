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
  if (score >= 70) return '🟢'
  if (score >= 50) return '🟡'
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

// ─── Hot Alert Formatter ─────────────────────────────────────────────────

interface HotAlertData {
  matchId: string
  rank: number
  score: number
  breakdown: Array<{ category: string; score: number; reason: string }>
  justificativa: string
  plan: string
  tender: {
    objeto: string
    orgao_nome: string
    uf: string
    municipio: string
    valor_estimado: number | null
    modalidade_nome: string | null
    data_encerramento: string | null
    numero: string | null
    ano: string | null
    pncp_id: string | null
  }
}

export function formatHotAlert(data: HotAlertData): { text: string; keyboard: InlineKeyboard } {
  const { matchId, rank, score, breakdown, justificativa, plan, tender } = data
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  // Extract top breakdown reason
  const sortedBreakdown = [...(breakdown || [])].sort((a, b) => b.score - a.score)
  const topReason = sortedBreakdown.length > 0 ? sortedBreakdown[0].reason : 'Match por IA'

  const modalidade = tender.modalidade_nome || 'Licitação'
  const numero = tender.numero ? ` nº ${tender.numero}` : ''
  const ano = tender.ano ? `/${tender.ano}` : ''

  let text = `🔥 <b>OPORTUNIDADE #${rank} — Score ${score}/100</b>\n\n`
  text += `${escapeHtml(modalidade)}${escapeHtml(numero)}${escapeHtml(ano)}\n`
  text += `${escapeHtml(tender.orgao_nome)} — ${escapeHtml(tender.municipio || '')}/${tender.uf}\n`
  text += `<b>Objeto:</b> ${escapeHtml(truncate(tender.objeto, 200))}\n\n`
  text += `✅ <b>Aderência:</b> ${score}% (${escapeHtml(truncate(topReason, 80))})\n\n`

  if (plan === 'enterprise') {
    // Enterprise: show real strategic data
    text += `┌─ 📊 ANÁLISE ESTRATÉGICA ─────────┐\n`
    if (tender.valor_estimado) {
      text += `│ Valor estimado: <b>${escapeHtml(formatCurrency(tender.valor_estimado))}</b>\n`
    }
    text += `│ Estratégia: ${escapeHtml(truncate(justificativa || 'Análise por IA', 150))}\n`
    text += `└─────────────────────────────────┘\n\n`
  } else {
    // Non-enterprise: show blocked/upsell
    text += `┌─ ░░ ANÁLISE ESTRATÉGICA BLOQUEADA ░░ ─┐\n`
    text += `│\n`
    text += `│ Valor estimado: R$ ███████\n`
    text += `│ Desconto sugerido: ██%\n`
    text += `│ Estratégia recomendada: ████████\n`
    text += `│\n`
    text += `│ 🏆 Quer GARANTIR que vai ganhar?\n`
    text += `│\n`
    text += `│ Nosso Consultor Estratégico\n`
    text += `│ analisa esta oportunidade,\n`
    text += `│ monta a estratégia de preço\n`
    text += `│ e acompanha até o resultado.\n`
    text += `└─────────────────────────────────┘\n\n`
  }

  if (tender.valor_estimado) {
    text += `💰 Esta oportunidade vale <b>${escapeHtml(formatCurrency(tender.valor_estimado))}</b>\n`
  }

  const keyboard = new InlineKeyboard()

  if (plan !== 'enterprise') {
    const schedulingUrl = process.env.UPSELL_SCHEDULING_URL || `${appUrl}/consultoria`
    const plansUrl = process.env.UPSELL_PLANS_URL || `${appUrl}/plans`
    keyboard
      .url('📞 Agendar Ligação', schedulingUrl)
      .url('⬆️ Upgrade Enterprise', plansUrl)
      .row()
  }

  keyboard
    .text('✅ Interesse', `match_interested_${matchId}`)
    .url('👁 Ver no App', `${appUrl}/opportunities/${matchId}`)
    .text('❌ Declinar', `match_dismiss_${matchId}`)

  return { text, keyboard }
}

// ─── Urgency Alert Formatters ────────────────────────────────────────────

interface UrgencyMatchData {
  id: string
  score: number
  objeto: string
  orgao: string
  uf: string
  municipio: string
  valor: number
  modalidade: string
  dataEncerramento: string
  numero: string
  ano: string
}

export function formatUrgencyAlert48h(matches: UrgencyMatchData[], totalValor: number): { text: string; keyboard: InlineKeyboard } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  let text = `⚠️ <b>ATENÇÃO — ${matches.length} oportunidade${matches.length > 1 ? 's' : ''} fecha${matches.length > 1 ? 'm' : ''} em 48h!</b>\n\n`

  for (let i = 0; i < Math.min(matches.length, 5); i++) {
    const m = matches[i]
    const num = m.numero ? ` nº ${m.numero}` : ''
    const enc = m.dataEncerramento ? formatDate(m.dataEncerramento) : 'N/I'

    text += `${i + 1}. ${escapeHtml(m.modalidade)}${escapeHtml(num)} — Score ${m.score}\n`
    text += `   ${escapeHtml(m.orgao)} — ${escapeHtml(m.municipio || '')}/${m.uf}\n`
    text += `   Encerra: ${escapeHtml(enc)}\n`
    if (m.valor > 0) text += `   Valor: <b>${escapeHtml(formatCurrency(m.valor))}</b>\n`
    text += `\n`
  }

  if (matches.length > 5) text += `... e mais ${matches.length - 5} oportunidade${matches.length - 5 > 1 ? 's' : ''}\n\n`

  if (totalValor > 0) text += `💸 Você está deixando <b>${escapeHtml(formatCurrency(totalValor))}</b> na mesa.\n`

  const keyboard = new InlineKeyboard().url('👁 Ver todas no App', `${appUrl}/pipeline`)
  return { text, keyboard }
}

export function formatUrgencyAlert24h(matches: UrgencyMatchData[], totalValor: number): { text: string; keyboard: InlineKeyboard } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'

  let text = `🚨 <b>ÚLTIMA CHANCE — ${matches.length} oportunidade${matches.length > 1 ? 's' : ''} fecha${matches.length > 1 ? 'm' : ''} em 24h!</b>\n\n`

  for (let i = 0; i < Math.min(matches.length, 5); i++) {
    const m = matches[i]
    const num = m.numero ? ` nº ${m.numero}` : ''
    const encDate = m.dataEncerramento ? new Date(m.dataEncerramento) : null
    const hora = encDate ? encDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : ''

    text += `${i + 1}. ${escapeHtml(m.modalidade)}${escapeHtml(num)} — Score ${m.score}\n`
    text += `   ${escapeHtml(m.orgao)} — ${escapeHtml(m.municipio || '')}/${m.uf}\n`
    text += `   ⏰ Encerra AMANHÃ às ${hora}\n`
    if (m.valor > 0) text += `   Valor: <b>${escapeHtml(formatCurrency(m.valor))}</b>\n`
    text += `\n`
  }

  if (matches.length > 5) text += `... e mais ${matches.length - 5}\n\n`

  if (totalValor > 0) text += `🔴 Você vai <b>PERDER ${escapeHtml(formatCurrency(totalValor))}</b> em oportunidades se não agir AGORA.\n`

  const keyboard = new InlineKeyboard().url('🔥 Ver oportunidades urgentes', `${appUrl}/pipeline`)
  return { text, keyboard }
}
