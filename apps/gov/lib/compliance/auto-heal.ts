'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { getProcessoDetail, listRiscos } from '@/lib/processos/queries'
import { listEstimativas } from '@/lib/precos/actions'
import { summarizeCompliance, type ComplianceCheck } from './engine'
import { PROMPTS, type ArtefatoTipo } from '@/lib/artefatos/prompts'
import { streamText, AI_MODELS, retrieveContext, formatContext } from '@licitagram/gov-core/ai'
import { buildUpstreamContext } from '@/lib/artefatos/upstream-context'
import { montarCestaIA, calcCestaStats, salvarCestaIA } from '@/lib/precos/cesta-ia'
import { logger } from '@/lib/logger'
import { revalidatePath } from 'next/cache'
import type { HealAction } from './auto-heal-types'

/**
 * Auto-heal: resolve automaticamente as pendências de compliance.
 * Filosofia: a ferramenta tende a ser autônoma — servidor clica "Resolver
 * automaticamente" e sistema itera pelas pendências, executando ação
 * corretiva específica de cada. Pendências que exigem ato humano formal
 * ficam sinalizadas como não-resolvíveis.
 */

/**
 * Map de handlers por check.id. Handler retorna promessa com descrição do
 * que foi feito. Pode lançar pra sinalizar falha.
 */
type HealHandler = (processoId: string, check: ComplianceCheck) => Promise<string>

const HANDLERS: Record<string, HealHandler> = {
  'dfd-presente': (id) => gerarArtefatoInterno(id, 'dfd'),
  'etp-presente': (id) => gerarArtefatoInterno(id, 'etp'),
  'etp-incisos-obrigatorios': (id) => gerarArtefatoInterno(id, 'etp', { forcarIncisos: true }),
  'mapa-riscos-presente': (id) => gerarArtefatoInterno(id, 'mapa_riscos'),
  'pesquisa-precos': (id) => gerarCestaAutomatica(id),
  'pesquisa-precos-minimo': (id) => gerarCestaAutomatica(id),
  'precos-coef-variacao': (id) => recalcularCestaRemovendoOutliers(id),
  'tr-presente': (id) => gerarArtefatoInterno(id, 'tr'),
  'edital-minuta': (id) => gerarArtefatoInterno(id, 'edital'),
  'parecer-juridico': (id) => gerarArtefatoInterno(id, 'parecer'),
}

const UNRESOLVABLE_CHECKS: Record<string, string> = {
  'matriz-riscos-grande-vulto':
    'Matriz de Riscos contratual de grande vulto requer aprovação formal da autoridade competente.',
}

/**
 * Executa o auto-heal em todas as pendências não-aprovadas. Sequencial
 * pra respeitar ordem de dependências (DFD antes de ETP antes de TR etc.)
 * e pra que a IA tenha contexto upstream atualizado a cada passo.
 */
export async function executarAutoHeal(processoId: string): Promise<HealAction[]> {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) throw new Error('Sem órgão')
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    throw new Error('Apenas admin/coordenador pode executar auto-heal')
  }

  const processo = await getProcessoDetail(processoId)
  if (!processo) throw new Error('Processo não encontrado')

  const [riscos, estimativas] = await Promise.all([
    listRiscos(processoId),
    listEstimativas(processoId),
  ])
  const summary = summarizeCompliance({ processo, riscos, estimativas })

  // Pendências que não passaram (qualquer severidade não-info)
  const pendentes = summary.checks.filter((c) => !c.passed)

  const results: HealAction[] = []

  // Ordem canônica (dfd → etp → riscos → precos → tr → edital → parecer)
  const ORDEM: string[] = [
    'dfd-presente',
    'etp-presente',
    'etp-incisos-obrigatorios',
    'mapa-riscos-presente',
    'pesquisa-precos',
    'pesquisa-precos-minimo',
    'precos-coef-variacao',
    'tr-presente',
    'edital-minuta',
    'parecer-juridico',
  ]

  const pendentesOrdenados = [...pendentes].sort((a, b) => {
    const ai = ORDEM.indexOf(a.id)
    const bi = ORDEM.indexOf(b.id)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  for (const check of pendentesOrdenados) {
    const handler = HANDLERS[check.id]
    const unresolvable = UNRESOLVABLE_CHECKS[check.id]

    if (unresolvable) {
      results.push({
        checkId: check.id,
        checkLabel: check.label,
        action: 'não-resolvível',
        status: 'unresolvable',
        detail: unresolvable,
      })
      continue
    }

    if (!handler) {
      results.push({
        checkId: check.id,
        checkLabel: check.label,
        action: 'sem handler',
        status: 'unresolvable',
        detail: 'Correção automática ainda não implementada pra esta verificação.',
      })
      continue
    }

    try {
      const detail = await handler(processoId, check)
      results.push({
        checkId: check.id,
        checkLabel: check.label,
        action: 'executado',
        status: 'success',
        detail,
      })
    } catch (e) {
      results.push({
        checkId: check.id,
        checkLabel: check.label,
        action: 'executado',
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
      })
      // Não interrompe o heal — tenta os próximos passos
    }
  }

  revalidatePath(`/processos/${processoId}`)
  revalidatePath(`/processos/${processoId}/compliance`)

  return results
}

// ─── Handlers específicos ────────────────────────────────────────────────

async function gerarArtefatoInterno(
  processoId: string,
  tipo: ArtefatoTipo,
  opts: { forcarIncisos?: boolean } = {},
): Promise<string> {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) throw new Error('Sem órgão')

  const processo = await getProcessoDetail(processoId)
  if (!processo) throw new Error('Processo não encontrado')

  const spec = PROMPTS[tipo]
  if (!spec) throw new Error(`Prompt não encontrado pra tipo ${tipo}`)

  const now = new Date()
  const ctx = {
    orgaoRazaoSocial: profile.orgao.razaoSocial,
    orgaoNomeFantasia: profile.orgao.nomeFantasia,
    orgaoCnpj: profile.orgao.cnpj,
    orgaoEsfera: profile.orgao.esfera,
    orgaoUf: profile.orgao.uf,
    orgaoMunicipio: profile.orgao.municipio,
    unidadeNome: processo.setorNome,
    responsavelNome: profile.nomeCompleto,
    responsavelCargo: profile.cargo,
    responsavelPapel: profile.papel,
    dataEmissao: now.toLocaleDateString('pt-BR'),
    anoExercicio: now.getFullYear(),
  }

  let userMessage = spec.renderUser(processo, ctx)
  if (opts.forcarIncisos && tipo === 'etp') {
    userMessage +=
      '\n\nREFORÇO CRÍTICO: garanta presença explícita e detalhada dos 5 incisos indispensáveis do art. 18 §2º: I (necessidade), IV (quantitativos com memória de cálculo), VI (valor + Acórdão TCU 1.875/2021), VIII (parcelamento/não), XIII (conclusão inequívoca). Sem esses o processo não pode avançar.'
  }

  const supabase = createClient()

  // RAG + upstream context
  let ragContext = ''
  try {
    const chunks = await retrieveContext(supabase, `${tipo} ${processo.objeto}`, {
      artefatoTipo: tipo,
      modalidade: processo.modalidade ?? undefined,
      limit: 6,
    })
    ragContext = formatContext(chunks)
  } catch {
    /* RAG opcional */
  }

  const upstream = await buildUpstreamContext(processoId, tipo).catch(() => '')
  const systemFinal = [spec.system, upstream, ragContext].filter(Boolean).join('\n\n')

  // Stream → concatena tudo → salva
  let full = ''
  const startedAt = Date.now()
  for await (const text of streamText({
    model: AI_MODELS.reasoning,
    system: systemFinal,
    userMessage,
    maxTokens: spec.maxTokens,
    temperature: spec.temperature,
  })) {
    if (text) full += text
  }

  if (!full || full.length < 200) {
    throw new Error(`IA retornou conteúdo insuficiente (${full.length} chars)`)
  }

  const { error } = await supabase.rpc('upsert_artefato', {
    p_processo_id: processoId,
    p_tipo: tipo,
    p_conteudo_markdown: full,
    p_modelo_usado: AI_MODELS.reasoning,
    p_tokens_input: null,
    p_tokens_output: null,
    p_tempo_geracao_ms: Date.now() - startedAt,
    p_status: 'gerado',
    p_citacoes: null,
    p_compliance: null,
  })
  if (error) throw new Error(`upsert_artefato falhou: ${error.message}`)

  // Avança fase se aplicável
  const NEXT_FASE: Record<string, string> = {
    dfd: 'etp',
    etp: 'riscos',
    mapa_riscos: 'precos',
    tr: 'compliance',
    edital: 'publicacao',
    parecer: 'edital',
  }
  const next = NEXT_FASE[tipo]
  if (next) {
    await supabase.rpc('set_processo_fase', { p_processo_id: processoId, p_fase: next })
  }

  return `Artefato ${tipo.toUpperCase()} gerado (${full.length.toLocaleString('pt-BR')} caracteres)`
}

async function gerarCestaAutomatica(processoId: string): Promise<string> {
  const processo = await getProcessoDetail(processoId)
  if (!processo) throw new Error('Processo não encontrado')

  const fontes = await montarCestaIA({
    query: processo.objeto,
    qtd: null,
    modalidadePreferida: processo.modalidade,
    mesesBack: 24,
    maxFontes: 6,
  })

  if (fontes.length === 0) {
    throw new Error('Nenhuma fonte análoga encontrada no PNCP nem no Painel Oficial. Amplie a descrição.')
  }
  if (fontes.length < 3) {
    throw new Error(
      `Apenas ${fontes.length} fonte(s) relevante(s). Acórdão TCU 1.875/2021 exige mínimo 3. Requer pesquisa manual complementar.`,
    )
  }

  const stats = await calcCestaStats(fontes)
  const narrativa = `A estimativa de valor adota metodologia de cesta de preços nos termos do Acórdão TCU 1.875/2021, consolidando ${stats.n} fontes de contratações análogas obtidas do PNCP (Portal Nacional de Contratações Públicas) e do Painel de Preços Oficial do Compras.gov.br, coletadas nos últimos 24 meses. A mediana apurada é de R$ ${stats.mediana.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, com coeficiente de variação de ${stats.cv.toFixed(2)}%${stats.cv < 25 ? ', atendendo integralmente ao limite jurisprudencial' : '; recomenda-se reavaliação de outliers'}. O valor estimado final, adotada a mediana, é de R$ ${stats.mediana.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. A cesta foi gerada automaticamente pelo sistema com priorização de contratações em modalidade compatível e dedup por órgão, assegurando representatividade amostral.`

  const res = await salvarCestaIA({
    processoId,
    itemDescricao: processo.objeto.slice(0, 200),
    fontes,
    metodo: 'mediana',
    narrativa,
  })
  if (!res.ok) throw new Error(res.error)

  return `Cesta automática: ${fontes.length} fontes · mediana R$ ${stats.mediana.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · CV ${stats.cv.toFixed(1)}%`
}

async function recalcularCestaRemovendoOutliers(processoId: string): Promise<string> {
  // Simplificação: regenera a cesta (que já exclui outliers via IQR no scoring)
  // Isso força re-compute com dados atuais e drop dos que foram marcados com
  // s_outlier=0 via filtro de scoring.
  return gerarCestaAutomatica(processoId)
}
