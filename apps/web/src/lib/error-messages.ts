/**
 * Traduz códigos de erro de server actions/Supabase pra mensagens amigáveis em PT-BR.
 * NUNCA mostra mensagem crua de Postgres/Supabase pro cliente.
 */
export function friendlyError(error: unknown): string {
  const raw =
    typeof error === 'string'
      ? error
      : (error as { message?: string })?.message || String(error)

  const lower = raw.toLowerCase()

  // Validação client/server
  if (lower.includes('phone_required') || lower.includes('telefone')) {
    return 'Por favor, informe um telefone com DDD (10 ou 11 dígitos).'
  }
  if (lower.includes('invalid_phone')) {
    return 'O telefone informado não parece válido. Confira o número e tente de novo.'
  }
  if (lower.includes('not_authenticated') || lower.includes('jwt')) {
    return 'Sua sessão expirou. Faça login novamente.'
  }
  if (lower.includes('no_company')) {
    return 'Você ainda não está vinculado a uma empresa. Complete o cadastro primeiro.'
  }
  if (lower.includes('invalid_current_password')) {
    return 'A senha atual não confere.'
  }
  if (lower.includes('password') && lower.includes('weak')) {
    return 'Sua nova senha precisa ter ao menos 8 caracteres, com 1 maiúscula, 1 número e 1 especial.'
  }

  // Postgres / Supabase patterns
  if (lower.includes('not-null constraint') || lower.includes('null value in column')) {
    return 'Algumas informações obrigatórias estão faltando. Recarregue a página e tente novamente — se persistir, fale com o suporte.'
  }
  if (lower.includes('unique constraint') || lower.includes('duplicate key')) {
    return 'Já existe um registro com esses dados. Tente novamente com valores diferentes.'
  }
  if (lower.includes('foreign key') || lower.includes('violates foreign')) {
    return 'Não conseguimos completar a ação porque um item relacionado não foi encontrado. Recarregue e tente de novo.'
  }
  if (lower.includes('check constraint')) {
    return 'Algum dos valores está fora do permitido. Confira os campos destacados.'
  }
  if (lower.includes('permission denied') || lower.includes('rls') || lower.includes('forbidden')) {
    return 'Você não tem permissão pra essa ação. Se acha que isso é um erro, fale com o suporte.'
  }
  if (lower.includes('timeout') || lower.includes('etimedout')) {
    return 'O servidor demorou pra responder. Tente novamente em alguns instantes.'
  }
  if (lower.includes('network') || lower.includes('fetch failed') || lower.includes('econnrefused')) {
    return 'Tivemos um problema de conexão. Verifique sua internet e tente de novo.'
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Você fez muitas tentativas em pouco tempo. Espere um minuto e tente de novo.'
  }
  if (lower.includes('stripe') || lower.includes('payment')) {
    return 'Tivemos um problema processando o pagamento. Tente de novo ou entre em contato com o suporte.'
  }

  // Action genérica
  if (lower.includes('cooldown') || lower.includes('wait')) {
    return 'Você já fez essa solicitação recentemente. Tente novamente em algumas horas.'
  }

  // Última opção: genérica + manter código de erro escondido pra debug interno
  console.error('[friendlyError] mensagem não-mapeada:', raw)
  return 'Algo não saiu como esperado. Tente novamente em alguns instantes — se persistir, fale com o suporte.'
}
