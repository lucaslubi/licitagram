/**
 * Traduz erros brutos de providers LLM (Gemini, Claude, Groq, Cerebras,
 * OpenRouter) em mensagens curtas e acionáveis em PT-BR. Nunca expõe JSON
 * gigante da API pro usuário.
 */
export function friendlyAIError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const s = raw.toLowerCase()

  // Truncamento explícito (novo em 2026-04-20)
  if (s.includes('truncou') || s.includes('finish_reason=length') || s.includes('excedeu o limite de tokens')) {
    return 'O documento excedeu o limite de tokens da IA. Tente reduzir o objeto do processo ou o contexto.'
  }

  if (s.includes('429') || s.includes('too many requests') || s.includes('quota') || s.includes('resource_exhausted') || s.includes('rate limit')) {
    if (s.includes('free_tier') || s.includes('free tier') || s.includes('limit: 0')) {
      return 'Cota gratuita do provedor de IA esgotada. Aguarde o reset (≈ alguns minutos) ou contate o administrador.'
    }
    return 'Limite de requisições atingido temporariamente. Tente novamente em alguns segundos — o sistema já tenta provedores alternativos automaticamente.'
  }

  if (
    s.includes('todos providers falharam') &&
    (s.includes('401') || s.includes('403') || s.includes('api key') || s.includes('unauthorized'))
  ) {
    return 'Todos os provedores de IA rejeitaram a requisição (chaves inválidas ou sem permissão). Contate o administrador do órgão.'
  }
  if (s.includes('api key') || s.includes('api_key') || s.includes('unauthorized') || s.includes('401')) {
    // Caso raro: erro chegou sem passar pelo fallback chain. Orienta tentar de novo.
    return 'Provedor de IA rejeitou a requisição. O sistema está tentando alternativas automaticamente — aguarde alguns segundos e tente novamente.'
  }

  if (s.includes('permission') || s.includes('403')) {
    return 'Sem permissão pra acessar o modelo de IA. Contate o administrador do órgão.'
  }

  if (s.includes('timeout') || s.includes('deadline') || s.includes('aborted')) {
    return 'A IA demorou demais pra responder. Tente novamente — pode ser sobrecarga momentânea do provedor.'
  }

  if (s.includes('safety') || s.includes('blocked') || s.includes('recitation')) {
    return 'A IA bloqueou a geração por política de segurança. Reformule ou simplifique o objeto do processo.'
  }

  if (s.includes('fetch') || s.includes('network') || s.includes('econnrefused') || s.includes('enotfound')) {
    return 'Sem conexão com o provedor de IA no momento. Tente novamente em instantes.'
  }

  if (s.includes('todos providers falharam')) {
    return 'Todos os provedores de IA estão fora no momento. Aguarde 1 minuto e tente novamente.'
  }

  // Fallback seguro: primeira linha sem JSON gigante
  const firstLine = raw.split('\n')[0]?.trim() ?? ''
  if (firstLine.length > 0 && firstLine.length < 240 && !firstLine.includes('{')) {
    return firstLine
  }
  return 'Falha na geração por IA. Tente novamente em instantes.'
}
