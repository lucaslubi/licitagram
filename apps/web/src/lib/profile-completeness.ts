import { createClient } from '@/lib/supabase/server'

/**
 * Avalia se o perfil da empresa está completo o suficiente pra
 * matching de qualidade. Componentes vazios diluem o score (vide
 * keyword-matcher.ts: kwScore + descScore zerados arrastam o
 * teto pra ~50). Cliente trial precisa saber.
 */
export type ProfileGap = {
  field: 'palavras_chave' | 'descricao_servicos' | 'capacidades' | 'faturamento_anual' | 'cnaes_secundarios'
  label: string
  hint: string
  href: string
}

export type ProfileCompletenessResult = {
  score: number          // 0-100
  gaps: ProfileGap[]
  isComplete: boolean
  level: 'incompleto' | 'parcial' | 'completo'
}

const FIELD_WEIGHT = {
  cnae_principal: 30,
  cnaes_secundarios: 15,
  palavras_chave: 25,
  descricao_servicos: 15,
  capacidades: 10,
  faturamento_anual: 5,
} as const

const FIELD_META: Record<ProfileGap['field'], { label: string; hint: string }> = {
  palavras_chave: {
    label: 'Palavras-chave',
    hint: 'Termos que descrevem o que sua empresa entrega. Sem isso o robô só pontua via CNAE — score cai pela metade.',
  },
  descricao_servicos: {
    label: 'Descrição de serviços',
    hint: 'Texto curto explicando capacidades. Aumenta a precisão semântica do match.',
  },
  capacidades: {
    label: 'Capacidades técnicas',
    hint: 'Equipamentos, certificações, técnicos especializados. Refina match em editais com requisitos específicos.',
  },
  faturamento_anual: {
    label: 'Faturamento anual',
    hint: 'Permite filtrar editais compatíveis com porte. Sem isso, valor entra com peso neutro.',
  },
  cnaes_secundarios: {
    label: 'CNAEs secundários',
    hint: 'Amplia cobertura pra editais adjacentes. Buscamos automaticamente na Receita Federal.',
  },
}

export async function getProfileCompleteness(
  companyId: string,
): Promise<ProfileCompletenessResult | null> {
  const supabase = await createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('cnae_principal, cnaes_secundarios, palavras_chave, descricao_servicos, capacidades, faturamento_anual')
    .eq('id', companyId)
    .maybeSingle()

  if (!company) return null

  let score = 0
  const gaps: ProfileGap[] = []

  if (company.cnae_principal) score += FIELD_WEIGHT.cnae_principal

  const sec = (company.cnaes_secundarios as string[] | null) || []
  if (sec.length >= 3) score += FIELD_WEIGHT.cnaes_secundarios
  else if (sec.length === 0) {
    gaps.push({ field: 'cnaes_secundarios', href: '/company', ...FIELD_META.cnaes_secundarios })
  } else {
    score += FIELD_WEIGHT.cnaes_secundarios * (sec.length / 3)
  }

  const kw = (company.palavras_chave as string[] | null) || []
  if (kw.length >= 5) score += FIELD_WEIGHT.palavras_chave
  else if (kw.length === 0) {
    gaps.push({ field: 'palavras_chave', href: '/company', ...FIELD_META.palavras_chave })
  } else {
    score += FIELD_WEIGHT.palavras_chave * (kw.length / 5)
  }

  const desc = (company.descricao_servicos as string | null) || ''
  if (desc.length >= 80) score += FIELD_WEIGHT.descricao_servicos
  else if (desc.length === 0) {
    gaps.push({ field: 'descricao_servicos', href: '/company', ...FIELD_META.descricao_servicos })
  } else {
    score += FIELD_WEIGHT.descricao_servicos * (desc.length / 80)
  }

  const caps = (company.capacidades as string[] | null) || []
  if (caps.length >= 3) score += FIELD_WEIGHT.capacidades
  else if (caps.length === 0) {
    gaps.push({ field: 'capacidades', href: '/company', ...FIELD_META.capacidades })
  } else {
    score += FIELD_WEIGHT.capacidades * (caps.length / 3)
  }

  if (company.faturamento_anual) score += FIELD_WEIGHT.faturamento_anual
  else gaps.push({ field: 'faturamento_anual', href: '/company', ...FIELD_META.faturamento_anual })

  const finalScore = Math.round(score)
  const level: ProfileCompletenessResult['level'] =
    finalScore >= 85 ? 'completo' : finalScore >= 60 ? 'parcial' : 'incompleto'

  return {
    score: finalScore,
    gaps: gaps.slice(0, 3), // mostra só top 3 mais impactantes
    isComplete: finalScore >= 85,
    level,
  }
}
