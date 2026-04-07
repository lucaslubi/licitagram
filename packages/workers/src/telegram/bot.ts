import { Bot, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { formatCurrency, formatDate, truncate } from '@licitagram/shared'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  logger.warn('TELEGRAM_BOT_TOKEN not set, bot disabled')
}

export const bot = token ? new Bot(token) : null

if (bot) {
  bot.command('start', async (ctx) => {
    const args = ctx.match?.trim()
    logger.info({ chatId: ctx.chat.id, args: args || '(none)' }, 'Telegram /start received')

    if (!args) {
      await ctx.reply(
        'Bem-vindo ao Licitagram Bot! 🏛️\n\n' +
          'Para vincular sua conta, envie:\n' +
          '/start seuemail@empresa.com\n\n' +
          'Comandos disponíveis:\n' +
          '/oportunidades - Ver melhores oportunidades\n' +
          '/top10 - Ranking dos 10 melhores matches\n' +
          '/buscar [termo] - Buscar licitações\n' +
          '/notificar - Receber alertas pendentes\n' +
          '/config - Configurar score mínimo\n' +
          '/pause - Pausar/retomar notificações\n' +
          '/status - Ver estatísticas\n' +
          '/help - Todos os comandos',
      )
      return
    }

    // Normalize email: trim, lowercase, remove accidental spaces
    const email = args.toLowerCase().replace(/\s/g, '')

    if (!email.includes('@') || !email.includes('.')) {
      await ctx.reply(
        '❌ Formato de email inválido.\n\n' +
          'Use: /start seuemail@empresa.com',
      )
      return
    }

    logger.info({ email, chatId: ctx.chat.id }, 'Looking up user by email')

    // First try exact match, then case-insensitive
    let { data: user } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('email', email)
      .single()

    // Fallback: try case-insensitive match via ilike
    if (!user) {
      const { data: userIlike } = await supabase
        .from('users')
        .select('id, full_name, email')
        .ilike('email', email)
        .single()
      user = userIlike
    }

    if (!user) {
      logger.warn({ email, chatId: ctx.chat.id }, 'Email not found in users table')
      await ctx.reply(
        '❌ Email não encontrado.\n\n' +
          'Verifique se você já se cadastrou no painel em:\n' +
          `${process.env.NEXT_PUBLIC_APP_URL || 'https://licitagram.com'}\n\n` +
          'Após cadastrar, tente novamente:\n' +
          `/start ${email}`,
      )
      return
    }

    // Check if already linked
    const { data: existing } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', user.id)
      .single()

    if (existing?.telegram_chat_id === ctx.chat.id) {
      await ctx.reply(
        `Sua conta já está vinculada, ${user.full_name}! ✅\n\n` +
          'Use /status para ver suas estatísticas.',
      )
      return
    }

    await supabase
      .from('users')
      .update({ telegram_chat_id: ctx.chat.id })
      .eq('id', user.id)

    await ctx.reply(
      `Conta vinculada com sucesso, ${user.full_name}! ✅\n\n` +
        'Você receberá alertas quando encontrarmos licitações compatíveis com sua empresa.\n\n' +
        'Use /config para ajustar o score mínimo de alertas.',
    )
    logger.info({ userId: user.id, chatId: ctx.chat.id, email }, 'Telegram account linked')

    // Fire-and-forget channel onboarding (TRIAL WOW or BACKFILL)
    void import('../queues/channel-onboarding.queue').then(({ channelOnboardingQueue }) =>
      channelOnboardingQueue.add(
        `onb-telegram-${user.id}`,
        { userId: user.id, channel: 'telegram' },
        { jobId: `onb-telegram-${user.id}` },
      ),
    ).catch((err) => logger.error({ err, userId: user.id }, 'Failed to enqueue telegram onboarding'))
  })

  bot.command('config', async (ctx) => {
    const { data: user } = await supabase
      .from('users')
      .select('id, min_score')
      .eq('telegram_chat_id', ctx.chat.id)
      .single()

    if (!user) {
      await ctx.reply('Conta não vinculada. Use /start para vincular.')
      return
    }

    const current = user.min_score ?? 60
    const keyboard = new InlineKeyboard()
      .text('40+', 'set_score_40')
      .text('50+', 'set_score_50')
      .text('60+', 'set_score_60')
      .row()
      .text('70+', 'set_score_70')
      .text('80+', 'set_score_80')
      .text('90+', 'set_score_90')

    await ctx.reply(
      `Score mínimo atual: ${current}\n\nEscolha o score mínimo para receber alertas:`,
      { reply_markup: keyboard },
    )
  })

  bot.callbackQuery(/^set_score_(\d+)$/, async (ctx) => {
    const score = parseInt(ctx.match[1])

    await supabase
      .from('users')
      .update({ min_score: score })
      .eq('telegram_chat_id', ctx.chat!.id)

    await ctx.answerCallbackQuery({ text: `Score mínimo atualizado para ${score}` })
    await ctx.editMessageText(`✅ Score mínimo atualizado para ${score}+\n\nVocê receberá alertas apenas para licitações com score acima de ${score}.`)
  })

  // ─── Healing System Callbacks ───────────────────────────────────────────
  bot.callbackQuery(/^healing_(approve|reject)_(\d+)$/, async (ctx) => {
    const action = ctx.match[1] // 'approve' or 'reject'
    const actionId = parseInt(ctx.match[2])
    const approved = action === 'approve'

    logger.info({ actionId, approved, chatId: ctx.chat?.id }, 'Healing callback received')

    try {
      const { executeHealingApproval } = await import('../processors/ai-healing.processor')
      const result = await executeHealingApproval(actionId, approved)
      await ctx.answerCallbackQuery({ text: approved ? '✅ Aprovado!' : '❌ Rejeitado.' })
      await ctx.editMessageText(result, { parse_mode: 'HTML' })
    } catch (err) {
      logger.error({ err, actionId }, 'Healing callback failed')
      await ctx.answerCallbackQuery({ text: 'Erro ao processar. Tente novamente.' })
    }
  })

  bot.command('status', async (ctx) => {
    const { data: user } = await supabase
      .from('users')
      .select('id, company_id')
      .eq('telegram_chat_id', ctx.chat.id)
      .single()

    if (!user?.company_id) {
      await ctx.reply('Conta não vinculada ou empresa não cadastrada.')
      return
    }

    const today = new Date().toISOString().split('T')[0]

    const { count: totalMatchesCount } = await supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento, modalidade_id)', { count: 'exact', head: true })
      .eq('company_id', user.company_id)
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })

    const { count: highMatchesCount } = await supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento, modalidade_id)', { count: 'exact', head: true })
      .eq('company_id', user.company_id)
      .gte('score', 70)
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })

    const { data: recent } = await supabase
      .from('matches')
      .select('score, tenders!inner(objeto, data_encerramento, modalidade_id)')
      .eq('company_id', user.company_id)
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('created_at', { ascending: false })
      .limit(3)

    const totalMatches = totalMatchesCount ?? 0
    const highMatches = highMatchesCount ?? 0

    let msg = `📊 *Suas Estatísticas*\n\n`
    msg += `Total de matches: ${totalMatches}\n`
    msg += `Matches acima de 70: ${highMatches}\n\n`

    if (recent && recent.length > 0) {
      msg += `*Últimos matches:*\n`
      for (const m of recent) {
        const obj = ((m.tenders as unknown) as Record<string, string>)?.objeto || 'N/A'
        const truncated = obj.length > 60 ? obj.slice(0, 57) + '...' : obj
        msg += `• Score ${m.score} - ${truncated}\n`
      }
    }

    await ctx.reply(msg, { parse_mode: 'Markdown' })
  })

  // /oportunidades - List top opportunities
  bot.command('oportunidades', async (ctx) => {
    const { data: user } = await supabase
      .from('users')
      .select('id, company_id, min_score')
      .eq('telegram_chat_id', ctx.chat.id)
      .single()

    if (!user?.company_id) {
      await ctx.reply('Conta não vinculada. Use /start seuemail@empresa.com para vincular.')
      return
    }

    const minScore = user.min_score ?? 45
    const today = new Date().toISOString().split('T')[0]
    const { data: matches } = await supabase
      .from('matches')
      .select(`
        id, score, status, ai_justificativa,
        tenders!inner (objeto, orgao_nome, uf, valor_estimado, data_abertura, data_encerramento, modalidade_nome, modalidade_id, pncp_id)
      `)
      .eq('company_id', user.company_id)
      .gte('score', minScore)
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false })
      .limit(10)

    if (!matches || matches.length === 0) {
      await ctx.reply(
        `Nenhuma oportunidade encontrada com score >= ${minScore}.\n\n` +
          'Use /config para ajustar o score mínimo.',
      )
      return
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    let msg = `🎯 *Top ${matches.length} Oportunidades* \\(score ≥ ${minScore}\\)\n\n`

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i]
      const tender = (m.tenders as unknown) as Record<string, unknown>
      const objeto = escTg(truncate((tender?.objeto as string) || 'N/A', 80))
      const orgao = escTg(truncate((tender?.orgao_nome as string) || '', 40))
      const uf = (tender?.uf as string) || '??'
      const valor = tender?.valor_estimado ? escTg(formatCurrency(tender.valor_estimado as number)) : 'N/I'
      const abertura = tender?.data_abertura ? escTg(formatDate(tender.data_abertura as string)) : 'N/I'
      const pncpId = tender?.pncp_id as string || ''
      const pncpUrl = pncpId ? `https://pncp.gov.br/app/editais/${pncpId.replace(/-/g, '/')}` : ''

      const emoji = m.score >= 70 ? '🟢' : m.score >= 50 ? '🟡' : '🔴'
      const statusLabel = m.status === 'interested' ? ' ✅' : m.status === 'dismissed' ? ' ❌' : ''

      msg += `${emoji} *${m.score}/100*${statusLabel}\n`
      msg += `${objeto}\n`
      msg += `🏛 ${orgao} \\| ${uf}\n`
      msg += `💰 ${valor} \\| 📅 ${abertura}\n`

      if (pncpUrl) {
        msg += `[Ver no PNCP](${pncpUrl}) \\| [Detalhes](${appUrl}/opportunities/${m.id})\n`
      }
      msg += `\n`
    }

    msg += `\n📊 Use /status para estatísticas\n⚙️ Use /config para ajustar score mínimo`

    await ctx.reply(msg, { parse_mode: 'MarkdownV2', link_preview_options: { is_disabled: true } })
  })

  // /notificar & /alertar - Send pending notifications for all unnotified high-score matches
  async function handleNotificar(ctx: any) {
    const { data: user } = await supabase
      .from('users')
      .select('id, company_id, min_score')
      .eq('telegram_chat_id', ctx.chat.id)
      .single()

    if (!user?.company_id) {
      await ctx.reply('Conta não vinculada. Use /start seuemail@empresa.com')
      return
    }

    const minScore = user.min_score ?? 45

    const today = new Date().toISOString().split('T')[0]
    const { data: pending } = await supabase
      .from('matches')
      .select(`
        id, score, breakdown, ai_justificativa,
        tenders!inner (objeto, orgao_nome, uf, valor_estimado, data_abertura, data_encerramento, modalidade_nome, modalidade_id)
      `)
      .eq('company_id', user.company_id)
      .eq('status', 'new')
      .gte('score', minScore)
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false })
      .limit(20)

    if (!pending || pending.length === 0) {
      await ctx.reply('✅ Nenhuma oportunidade pendente de notificação!')
      return
    }

    await ctx.reply(`📬 Enviando ${pending.length} oportunidades...`)

    const { formatMatchAlert } = await import('./formatters')

    for (const match of pending) {
      try {
        const tender = (match.tenders as unknown) as Record<string, unknown>

        const { text, keyboard } = formatMatchAlert({
          matchId: match.id,
          score: match.score,
          breakdown: (match.breakdown as Array<{ category: string; score: number; reason: string }>) || [],
          justificativa: match.ai_justificativa || '',
          tender: {
            objeto: (tender?.objeto as string) || '',
            orgao_nome: (tender?.orgao_nome as string) || '',
            uf: (tender?.uf as string) || '',
            valor_estimado: tender?.valor_estimado as number | null,
            data_abertura: tender?.data_abertura as string | null,
            modalidade_nome: tender?.modalidade_nome as string | null,
          },
        })

        await bot!.api.sendMessage(ctx.chat.id, text, {
          parse_mode: 'MarkdownV2',
          reply_markup: keyboard,
        })

        await supabase
          .from('matches')
          .update({ status: 'notified', notified_at: new Date().toISOString() })
          .eq('id', match.id)

        // Rate limit: wait 500ms between messages
        await new Promise((r) => setTimeout(r, 500))
      } catch (err) {
        logger.error({ matchId: match.id, err }, 'Failed to send alert')
      }
    }

    const { count: remainingCount } = await supabase
      .from('matches')
      .select('id, tenders!inner(data_encerramento, modalidade_id)', { count: 'exact', head: true })
      .eq('company_id', user.company_id)
      .eq('status', 'new')
      .gte('score', minScore)
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
    const remaining = remainingCount ?? 0

    if (remaining && remaining > 0) {
      await ctx.reply(`✅ Alertas enviados! Ainda restam ${remaining} oportunidades. Use /notificar novamente para ver mais.`)
    } else {
      await ctx.reply('✅ Todos os alertas pendentes foram enviados!')
    }
  }

  bot.command('notificar', handleNotificar)
  bot.command('alertar', handleNotificar)

  // /buscar [termo] - Search tenders by keyword
  bot.command('buscar', async (ctx) => {
    const termo = ctx.match?.trim()
    if (!termo) {
      await ctx.reply('Use: /buscar [termo]\nExemplo: /buscar informatica')
      return
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, company_id')
      .eq('telegram_chat_id', ctx.chat.id)
      .single()

    if (!user) {
      await ctx.reply('Conta não vinculada. Use /start seuemail@empresa.com')
      return
    }

    // Accent-insensitive pattern
    const accentChars = 'aáàâãeéèêiíìoóòôõuúùüçAÁÀÂÃEÉÈÊIÍÌOÓÒÔÕUÚÙÜÇ'
    const pattern = termo.split('').map((ch: string) => accentChars.includes(ch) ? '_' : ch).join('')

    const { data: tenders } = await supabase
      .from('tenders')
      .select('id, objeto, orgao_nome, uf, valor_estimado, data_abertura, source')
      .ilike('objeto', `%${pattern}%`)
      .order('data_publicacao', { ascending: false })
      .limit(5)

    if (!tenders || tenders.length === 0) {
      await ctx.reply(`🔍 Nenhuma licitação encontrada para "${termo}"`)
      return
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    let msg = `🔍 *Resultados para "${escTg(termo)}"*\n\n`

    for (const t of tenders) {
      const obj = escTg(truncate(t.objeto || 'N/A', 80))
      const orgao = escTg(truncate(t.orgao_nome || '', 40))
      const valor = t.valor_estimado ? escTg(formatCurrency(t.valor_estimado)) : 'N/I'
      const sourceLabel = t.source === 'comprasgov' ? '🔵' : t.source === 'bec_sp' ? '🟡' : '🟢'

      msg += `${sourceLabel} *${obj}*\n`
      msg += `🏛 ${orgao} \\| ${t.uf || '??'}\n`
      msg += `💰 ${valor}\n`
      msg += `[Ver detalhes](${appUrl}/opportunities/tender/${t.id})\n\n`
    }

    await ctx.reply(msg, { parse_mode: 'MarkdownV2', link_preview_options: { is_disabled: true } })
  })

  // /top10 - Show top 10 matches by score
  bot.command('top10', async (ctx) => {
    const { data: user } = await supabase
      .from('users')
      .select('id, company_id')
      .eq('telegram_chat_id', ctx.chat.id)
      .single()

    if (!user?.company_id) {
      await ctx.reply('Conta não vinculada ou empresa não cadastrada.')
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const { data: matches } = await supabase
      .from('matches')
      .select(`
        id, score, recomendacao,
        tenders!inner (objeto, orgao_nome, uf, valor_estimado, data_abertura, data_encerramento, modalidade_id)
      `)
      .eq('company_id', user.company_id)
      .not('tenders.modalidade_nome', 'in', '(Inexigibilidade,Credenciamento)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .order('score', { ascending: false })
      .limit(10)

    if (!matches || matches.length === 0) {
      await ctx.reply('Nenhum match encontrado ainda. Aguarde o processamento das licitações.')
      return
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    let msg = `🏆 *Top ${matches.length} Matches*\n\n`

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i]
      const t = (m.tenders as unknown) as Record<string, unknown>
      const emoji = m.score >= 70 ? '🟢' : m.score >= 50 ? '🟡' : '🔴'
      const rec = m.recomendacao === 'participar' ? '✅' : m.recomendacao === 'nao_recomendado' ? '⛔' : '🔎'
      const obj = escTg(truncate((t?.objeto as string) || 'N/A', 70))
      const valor = t?.valor_estimado ? escTg(formatCurrency(t.valor_estimado as number)) : 'N/I'

      msg += `*${i + 1}\\.* ${emoji} *${m.score}/100* ${rec}\n`
      msg += `${obj}\n`
      msg += `💰 ${valor}\n`
      msg += `[Ver](${appUrl}/opportunities/${m.id})\n\n`
    }

    await ctx.reply(msg, { parse_mode: 'MarkdownV2', link_preview_options: { is_disabled: true } })
  })

  // /pause - Toggle notification pause
  bot.command('pause', async (ctx) => {
    const { data: user } = await supabase
      .from('users')
      .select('id, notification_preferences')
      .eq('telegram_chat_id', ctx.chat.id)
      .single()

    if (!user) {
      await ctx.reply('Conta não vinculada. Use /start seuemail@empresa.com')
      return
    }

    const prefs = (user.notification_preferences as Record<string, unknown>) || {}
    const currentlyPaused = prefs.telegram === false

    const newPrefs = { ...prefs, telegram: currentlyPaused ? true : false }
    await supabase
      .from('users')
      .update({ notification_preferences: newPrefs })
      .eq('id', user.id)

    if (currentlyPaused) {
      await ctx.reply('🔔 Notificações reativadas! Você voltará a receber alertas de novas oportunidades.')
    } else {
      await ctx.reply('🔕 Notificações pausadas. Use /pause novamente para reativar.')
    }
  })

  // /help - Show all commands
  bot.command('help', async (ctx) => {
    await ctx.reply(
      '🏛️ *Licitagram Bot \\- Comandos*\n\n' +
        '📋 *Oportunidades*\n' +
        '/oportunidades \\- Ver suas melhores oportunidades\n' +
        '/top10 \\- Ranking dos 10 melhores matches\n' +
        '/buscar \\[termo\\] \\- Buscar licitações por palavra\\-chave\n' +
        '/notificar \\- Receber alertas pendentes\n\n' +
        '⚙️ *Configurações*\n' +
        '/config \\- Ajustar score mínimo de alertas\n' +
        '/pause \\- Pausar/retomar notificações\n' +
        '/status \\- Ver suas estatísticas\n\n' +
        '🔗 *Conta*\n' +
        '/start \\[email\\] \\- Vincular sua conta\n' +
        '/help \\- Mostrar esta mensagem',
      { parse_mode: 'MarkdownV2' },
    )
  })

  // Callback: paginate oportunidades
  bot.callbackQuery(/^oport_page_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery()
    // Future: implement pagination
  })

  // Handle outcome reporting callbacks
  bot.callbackQuery(/^outcome_(won|lost|skip)_(.+)$/, async (ctx) => {
    const outcome = ctx.match[1] as 'won' | 'lost' | 'skip'
    const matchId = ctx.match[2]

    const outcomeMap: Record<string, string> = { won: 'won', lost: 'lost', skip: 'did_not_participate' }
    const outcomeValue = outcomeMap[outcome]

    const chatId = ctx.chat?.id
    const { data: user } = await supabase
      .from('users')
      .select('id, company_id')
      .eq('telegram_chat_id', chatId)
      .single()

    if (!user) {
      await ctx.answerCallbackQuery({ text: 'Usuário não encontrado' })
      return
    }

    // Scope match lookup to user's company
    const { data: match } = await supabase
      .from('matches')
      .select('id, tender_id')
      .eq('id', matchId)
      .eq('company_id', user.company_id)
      .single()

    if (!match) {
      await ctx.answerCallbackQuery({ text: 'Licitação não encontrada' })
      return
    }

    // Insert bid_outcome (upsert to handle duplicates)
    await supabase
      .from('bid_outcomes')
      .upsert({
        match_id: matchId,
        company_id: user.company_id,
        tender_id: match.tender_id,
        outcome: outcomeValue,
        reported_via: 'telegram',
        reported_at: new Date().toISOString(),
      }, { onConflict: 'match_id' })

    // Update match status
    await supabase
      .from('matches')
      .update({ status: outcomeValue === 'did_not_participate' ? 'dismissed' : outcomeValue })
      .eq('id', matchId)

    const responses: Record<string, string> = {
      won: '🎉 Parabéns pela vitória! Resultado registrado.',
      lost: '😔 Resultado registrado. Continue firme!',
      skip: '👍 Registrado como não participou.',
    }

    await ctx.answerCallbackQuery({ text: responses[outcome] })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined })

    logger.info({ matchId, outcome: outcomeValue, userId: user.id }, 'Outcome reported via Telegram')
  })

  // Handle match action callbacks — scoped to user's company
  bot.callbackQuery(/^match_(interested|dismiss)_(.+)$/, async (ctx) => {
    const action = ctx.match[1]
    const matchId = ctx.match[2]

    // Verify caller owns this match via their company
    const { data: user } = await supabase
      .from('users')
      .select('company_id')
      .eq('telegram_chat_id', ctx.chat?.id)
      .single()

    if (!user) {
      await ctx.answerCallbackQuery({ text: 'Conta não vinculada' })
      return
    }

    const status = action === 'interested' ? 'interested' : 'dismissed'
    await supabase.from('matches').update({ status }).eq('id', matchId).eq('company_id', user.company_id)

    const emoji = action === 'interested' ? '✅' : '❌'
    const label = action === 'interested' ? 'Interesse registrado' : 'Licitação descartada'
    await ctx.answerCallbackQuery({ text: `${emoji} ${label}` })
    await ctx.editMessageReplyMarkup({ reply_markup: undefined })
  })

  bot.catch((err) => {
    logger.error({ err: err.error }, 'Telegram bot error')
  })
}

// Escape MarkdownV2 special characters for Telegram
function escTg(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
}

export async function startBot() {
  if (!bot) {
    logger.warn('Telegram bot not started (no token)')
    return
  }

  logger.info('Starting Telegram bot...')

  // Drop pending updates to avoid processing stale commands from previous sessions
  // and to resolve conflicts when multiple instances were running
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('deleteWebhook timeout (5s)')), 5000),
    )
    await Promise.race([
      bot.api.deleteWebhook({ drop_pending_updates: true }),
      timeout,
    ])
    logger.info('Cleared pending Telegram updates')
  } catch (err) {
    logger.warn({ err }, 'Failed to clear pending Telegram updates (continuing anyway)')
  }

  bot.start({
    drop_pending_updates: true,
    allowed_updates: ['message', 'callback_query'],
    onStart: () => {
      logger.info('Telegram bot polling active')
    },
  })
  logger.info('Telegram bot started (polling, pending updates dropped)')
}
