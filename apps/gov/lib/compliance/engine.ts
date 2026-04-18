import type { ProcessoDetail } from '@/lib/processos/queries'
import type { Risco } from '@/lib/processos/queries'
import type { EstimativaRow } from '@/lib/precos/actions'

export type Severity = 'critica' | 'alta' | 'media' | 'baixa' | 'info'

export interface ComplianceCheck {
  id: string
  label: string
  passed: boolean
  severity: Severity
  detail: string
  citation?: { lei: string; artigo: string; paragrafo?: string; inciso?: string; acordao?: string }
}

export interface ComplianceInput {
  processo: ProcessoDetail
  riscos: Risco[]
  estimativas: EstimativaRow[]
}

const VALOR_GRANDE_VULTO = 200_000_000 // art. 6º XXII

/**
 * Compliance Engine determinístico — regras puras, sem LLM.
 * Cada regra retorna um ComplianceCheck com citação legal.
 * A UI usa severity='critica' para bloquear publicação.
 */
export function runComplianceChecks(input: ComplianceInput): ComplianceCheck[] {
  const { processo, riscos, estimativas } = input
  const checks: ComplianceCheck[] = []
  const artefatosByTipo = new Map(processo.artefatos.map((a) => [a.tipo, a]))

  // ──────────────────────────────────────────────
  // DFD presente (art. 12 VII)
  // ──────────────────────────────────────────────
  const dfd = artefatosByTipo.get('dfd')
  checks.push({
    id: 'dfd-presente',
    label: 'DFD — Documento de Oficialização da Demanda',
    passed: !!dfd,
    severity: dfd ? 'info' : 'critica',
    detail: dfd
      ? `DFD gerado${dfd.aprovadoEm ? ' e aprovado' : ' (aguardando aprovação)'}.`
      : 'Sem DFD. Processo não formalizado — viola art. 12, VII da Lei 14.133/2021.',
    citation: { lei: 'Lei 14.133/2021', artigo: '12', inciso: 'VII' },
  })

  // ──────────────────────────────────────────────
  // ETP presente (art. 18)
  // ──────────────────────────────────────────────
  const etp = artefatosByTipo.get('etp')
  checks.push({
    id: 'etp-presente',
    label: 'ETP — Estudo Técnico Preliminar',
    passed: !!etp,
    severity: etp ? 'info' : 'critica',
    detail: etp
      ? `ETP gerado${etp.aprovadoEm ? ' e aprovado' : ' (aguardando aprovação)'}.`
      : 'Sem ETP. Obrigatório pela Lei 14.133/2021, art. 18.',
    citation: { lei: 'Lei 14.133/2021', artigo: '18' },
  })

  // ──────────────────────────────────────────────
  // ETP cobre os 5 incisos obrigatórios (art. 18 §2º)
  // ──────────────────────────────────────────────
  if (etp && etp.tipo === 'etp') {
    const hasMarkdown = typeof (etp as unknown as { conteudoMarkdown?: string }).conteudoMarkdown === 'string'
    // Como a lista no artefato agregado não traz o markdown, checagem
    // literal de incisos fica melhor na página dedicada de ETP, com
    // `getArtefato(...)`. Aqui só deixamos o check como informativo.
    checks.push({
      id: 'etp-incisos-obrigatorios',
      label: '5 incisos obrigatórios do ETP (art. 18 §2º)',
      passed: hasMarkdown,
      severity: 'alta',
      detail:
        'Incisos I, IV, VI, VIII e XIII devem estar cobertos. Verificação de conteúdo acontece na página do ETP.',
      citation: { lei: 'Lei 14.133/2021', artigo: '18', paragrafo: '2º' },
    })
  }

  // ──────────────────────────────────────────────
  // Mapa de Riscos (art. 18 §1º X)
  // ──────────────────────────────────────────────
  checks.push({
    id: 'mapa-riscos-presente',
    label: 'Mapa de Riscos',
    passed: riscos.length > 0,
    severity: riscos.length === 0 ? 'alta' : 'info',
    detail:
      riscos.length === 0
        ? 'Nenhum risco registrado. ETP requer análise de riscos (art. 18 §1º X).'
        : `${riscos.length} riscos identificados. Riscos de nível alto: ${riscos.filter((r) => r.nivelRisco === 'alto').length}.`,
    citation: { lei: 'Lei 14.133/2021', artigo: '18', paragrafo: '1º', inciso: 'X' },
  })

  // ──────────────────────────────────────────────
  // Matriz de Riscos obrigatória em grande vulto
  // ──────────────────────────────────────────────
  const isGrandeVulto = (processo.valorEstimado ?? 0) >= VALOR_GRANDE_VULTO
  if (isGrandeVulto) {
    // Por enquanto, a Matriz contratual é tratada junto com o Edital.
    checks.push({
      id: 'matriz-riscos-grande-vulto',
      label: 'Matriz de Riscos (grande vulto > R$ 200M)',
      passed: artefatosByTipo.has('matriz_riscos'),
      severity: 'critica',
      detail:
        'Contratos de grande vulto ou integrada/semi-integrada exigem Matriz de Riscos contratual. Art. 22 e art. 103 §3º.',
      citation: { lei: 'Lei 14.133/2021', artigo: '22' },
    })
  }

  // ──────────────────────────────────────────────
  // Pesquisa de preços (art. 23, Acórdão TCU 1.875/2021)
  // ──────────────────────────────────────────────
  if (estimativas.length === 0) {
    checks.push({
      id: 'pesquisa-precos',
      label: 'Pesquisa de preços (cesta TCU)',
      passed: false,
      severity: 'critica',
      detail: 'Sem estimativa de preço. Exigida pelo art. 23 e Acórdão 1.875/2021-TCU.',
      citation: { lei: 'Lei 14.133/2021', artigo: '23', acordao: 'Acórdão TCU 1.875/2021' },
    })
  } else {
    const min = estimativas.find((e) => e.qtdAmostras < 3)
    checks.push({
      id: 'pesquisa-precos-minimo',
      label: 'Cesta de preços com mín. 3 fontes',
      passed: !min,
      severity: min ? 'alta' : 'info',
      detail: min
        ? `Item "${min.itemDescricao.slice(0, 60)}" tem ${min.qtdAmostras} fonte(s). Mínimo 3 exigido.`
        : 'Todos itens com ≥ 3 fontes. Estrutura da cesta compatível com Acórdão 1.875/2021-TCU.',
      citation: { lei: 'Lei 14.133/2021', artigo: '23', acordao: 'Acórdão TCU 1.875/2021' },
    })
    // Alta variabilidade (CV > 25%) é bandeira amarela
    const altaVariacao = estimativas.filter((e) => (e.cv ?? 0) > 25)
    if (altaVariacao.length > 0) {
      checks.push({
        id: 'precos-coef-variacao',
        label: 'Coeficiente de variação dos preços',
        passed: false,
        severity: 'media',
        detail: `${altaVariacao.length} item(s) com CV > 25%. Verifique outliers ou justifique amostra heterogênea.`,
      })
    }
  }

  // ──────────────────────────────────────────────
  // TR presente (art. 6º XXIII)
  // ──────────────────────────────────────────────
  const tr = artefatosByTipo.get('tr')
  checks.push({
    id: 'tr-presente',
    label: 'Termo de Referência / Projeto Básico',
    passed: !!tr || !!artefatosByTipo.get('projeto_basico'),
    severity: tr ? 'info' : 'critica',
    detail: tr
      ? 'TR gerado. Alíneas a-j do art. 6º XXIII devem estar cobertas.'
      : 'Sem TR. Obrigatório para toda contratação (art. 6º XXIII).',
    citation: { lei: 'Lei 14.133/2021', artigo: '6º', inciso: 'XXIII' },
  })

  // ──────────────────────────────────────────────
  // Edital (art. 25)
  // ──────────────────────────────────────────────
  const edital = artefatosByTipo.get('edital')
  checks.push({
    id: 'edital-minuta',
    label: 'Minuta do edital (art. 25)',
    passed: !!edital,
    severity: edital ? 'info' : 'alta',
    detail: edital
      ? 'Minuta gerada. Precisa revisão jurídica antes da publicação.'
      : 'Sem minuta de edital. Obrigatório antes da fase externa.',
    citation: { lei: 'Lei 14.133/2021', artigo: '25' },
  })

  // ──────────────────────────────────────────────
  // Parecer Jurídico (art. 53)
  // ──────────────────────────────────────────────
  const parecer = artefatosByTipo.get('parecer')
  checks.push({
    id: 'parecer-juridico',
    label: 'Parecer Jurídico Referencial (art. 53)',
    passed: !!parecer,
    severity: parecer ? 'info' : 'alta',
    detail: parecer
      ? 'Parecer gerado — aprovação de assessoria jurídica recomendada antes da publicação.'
      : 'Sem parecer jurídico. Art. 53 exige análise jurídica da fase interna.',
    citation: { lei: 'Lei 14.133/2021', artigo: '53' },
  })

  return checks
}

export interface ComplianceSummary {
  total: number
  passed: number
  criticas: number
  altas: number
  medias: number
  canPublish: boolean
  checks: ComplianceCheck[]
}

export function summarizeCompliance(input: ComplianceInput): ComplianceSummary {
  const checks = runComplianceChecks(input)
  const passed = checks.filter((c) => c.passed).length
  const criticas = checks.filter((c) => !c.passed && c.severity === 'critica').length
  const altas = checks.filter((c) => !c.passed && c.severity === 'alta').length
  const medias = checks.filter((c) => !c.passed && c.severity === 'media').length
  return {
    total: checks.length,
    passed,
    criticas,
    altas,
    medias,
    canPublish: criticas === 0,
    checks,
  }
}
