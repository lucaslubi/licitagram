import type { ConsolidationItem } from './consolidation-prompt'

export type CheckSeverity = 'critica' | 'alta' | 'media' | 'baixa' | 'info'

export interface ComplianceCheck {
  id: string
  label: string
  passed: boolean
  severity: CheckSeverity
  detail: string
  citation?: { lei: string; artigo: string; paragrafo?: string; inciso?: string; acordao?: string }
}

const DISPENSA_COMPRAS_GERAIS = 50_000 // R$ (art. 75, II, Lei 14.133)
const DISPENSA_OBRAS = 100_000 // R$ (art. 75, I)

function totalValue(items: ConsolidationItem[]): number {
  return items.reduce((sum, i) => {
    const qty = i.quantidade ?? 1
    // Sem preço estimado nesta fase — consolidação só aponta quantidades
    return sum + qty
  }, 0)
}

/**
 * Detecta potencial fracionamento ilícito: mesma categoria/descrição
 * agrupada somando mais que limite de dispensa.
 * Pura heurística em cima de descrição — o Compliance Engine de verdade
 * (Fase 8) faz com CATMAT + preço estimado.
 */
function detectPotentialFracionamento(items: ConsolidationItem[]): string[] {
  const byCategory = new Map<string, ConsolidationItem[]>()
  for (const item of items) {
    const key = (item.categoria ?? item.descricao.split(/\s+/).slice(0, 2).join(' ')).toLowerCase()
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key)!.push(item)
  }
  const flags: string[] = []
  for (const [key, group] of byCategory) {
    if (group.length >= 3) {
      flags.push(`"${key}" aparece em ${group.length} setores diferentes — revisar se não caracteriza fracionamento (art. 23 §1º).`)
    }
  }
  return flags
}

function countSetores(items: ConsolidationItem[]): number {
  return new Set(items.map((i) => i.setorNome)).size
}

/**
 * Checklist determinístico pré-publicação. NÃO usa LLM — regras puras.
 */
export function runComplianceChecks(items: ConsolidationItem[]): ComplianceCheck[] {
  const checks: ComplianceCheck[] = []

  checks.push({
    id: 'has-itens',
    label: 'Ao menos 1 item coletado',
    passed: items.length > 0,
    severity: items.length > 0 ? 'info' : 'critica',
    detail:
      items.length > 0
        ? `${items.length} itens coletados.`
        : 'Sem itens no PCA — publicar vazio viola art. 12, VII, Lei 14.133/2021.',
    citation: { lei: 'Lei 14.133/2021', artigo: '12', inciso: 'VII' },
  })

  const setoresCount = countSetores(items)
  checks.push({
    id: 'multi-setor',
    label: 'Participação multi-setorial',
    passed: setoresCount >= 1,
    severity: setoresCount >= 2 ? 'info' : setoresCount === 1 ? 'baixa' : 'critica',
    detail:
      setoresCount >= 2
        ? `${setoresCount} setores participaram.`
        : setoresCount === 1
          ? 'Apenas 1 setor respondeu. PCA representativo requer consulta ampla.'
          : 'Nenhum setor respondeu.',
  })

  const semDescricao = items.filter((i) => !i.descricao || i.descricao.trim().length < 5)
  checks.push({
    id: 'descricao-adequada',
    label: 'Descrições com ≥ 5 caracteres',
    passed: semDescricao.length === 0,
    severity: semDescricao.length > 0 ? 'alta' : 'info',
    detail:
      semDescricao.length === 0
        ? 'Todas descrições adequadas.'
        : `${semDescricao.length} itens com descrição muito curta — difícil de categorizar e licitar.`,
  })

  const semQuantidade = items.filter((i) => i.quantidade == null || i.quantidade <= 0)
  checks.push({
    id: 'quantidade-preenchida',
    label: 'Quantidades preenchidas',
    passed: semQuantidade.length === 0,
    severity: semQuantidade.length > items.length / 2 ? 'alta' : 'media',
    detail:
      semQuantidade.length === 0
        ? 'Todos itens com quantidade.'
        : `${semQuantidade.length} de ${items.length} itens sem quantidade. PCA sem quantidade é apenas intenção.`,
  })

  const semUnidade = items.filter((i) => !i.unidadeMedida)
  checks.push({
    id: 'unidade-medida',
    label: 'Unidades de medida',
    passed: semUnidade.length < items.length * 0.2,
    severity: semUnidade.length > 0 ? 'media' : 'info',
    detail:
      semUnidade.length === 0
        ? 'Todas unidades informadas.'
        : `${semUnidade.length} itens sem unidade de medida.`,
  })

  const fracionamentoFlags = detectPotentialFracionamento(items)
  checks.push({
    id: 'fracionamento',
    label: 'Risco de fracionamento',
    passed: fracionamentoFlags.length === 0,
    severity: fracionamentoFlags.length > 0 ? 'alta' : 'info',
    detail:
      fracionamentoFlags.length === 0
        ? 'Nenhum indício heurístico de fracionamento.'
        : fracionamentoFlags.join(' '),
    citation: { lei: 'Lei 14.133/2021', artigo: '23', paragrafo: '1º' },
  })

  return checks
}

export interface ComplianceSummary {
  total: number
  passed: number
  criticas: number
  altas: number
  canPublish: boolean
  checks: ComplianceCheck[]
}

export function summarize(items: ConsolidationItem[]): ComplianceSummary {
  const checks = runComplianceChecks(items)
  const passed = checks.filter((c) => c.passed).length
  const criticas = checks.filter((c) => !c.passed && c.severity === 'critica').length
  const altas = checks.filter((c) => !c.passed && c.severity === 'alta').length
  return {
    total: checks.length,
    passed,
    criticas,
    altas,
    // Bloqueia publicação se houver crítica. Alta permite publicar com aviso.
    canPublish: criticas === 0,
    checks,
  }
}
