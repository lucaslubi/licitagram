/**
 * Traduz erros brutos de providers LLM (Gemini, Claude) em mensagens
 * curtas e acionáveis em PT-BR. Nunca expõe JSON gigante da API pro usuário.
 */
export function friendlyAIError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const s = raw.toLowerCase()

  if (s.includes('429') || s.includes('too many requests') || s.includes('quota')) {
    if (s.includes('free_tier') || s.includes('free tier') || s.includes('limit: 0')) {
      return 'Cota gratuita do Gemini esgotada. Ative o billing no Google Cloud ou aguarde o reset diário (≈ 24h).'
    }
    return 'Limite de requisições atingido temporariamente. Tente novamente em alguns segundos.'
  }

  if (s.includes('api key') || s.includes('api_key') || s.includes('unauthorized') || s.includes('401')) {
    return 'Chave da API de IA inválida ou ausente. Contate o administrador do órgão.'
  }

  if (s.includes('permission') || s.includes('403')) {
    return 'Sem permissão pra acessar o modelo de IA. Verifique o billing do Google Cloud.'
  }

  if (s.includes('timeout') || s.includes('deadline') || s.includes('aborted')) {
    return 'A IA demorou demais pra responder. Tente novamente.'
  }

  if (s.includes('safety') || s.includes('blocked') || s.includes('recitation')) {
    return 'A IA bloqueou a geração por política de segurança. Reformule ou simplifique o objeto do processo.'
  }

  if (s.includes('fetch') || s.includes('network') || s.includes('econnrefused') || s.includes('enotfound')) {
    return 'Sem conexão com o provedor de IA no momento. Tente novamente em instantes.'
  }

  // Fallback seguro: primeira linha sem JSON gigante
  const firstLine = raw.split('\n')[0]?.trim() ?? ''
  if (firstLine.length > 0 && firstLine.length < 240 && !firstLine.includes('{')) {
    return firstLine
  }
  return 'Falha na geração por IA. Tente novamente em instantes.'
}
