import { describe, it, expect } from 'vitest'
import { runComplianceChecks, summarizeCompliance } from './engine'
import type { ProcessoDetail, Risco } from '@/lib/processos/queries'
import type { EstimativaRow } from '@/lib/precos/actions'

function makeProcesso(overrides: Partial<ProcessoDetail> = {}): ProcessoDetail {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    numeroInterno: '2027/0001',
    objeto: 'Aquisição de papel A4 para uso administrativo',
    tipo: 'material',
    modalidade: 'pregao',
    criterioJulgamento: null,
    modoDisputa: null,
    valorEstimado: 80_000,
    faseAtual: 'tr',
    setorNome: 'Secretaria Geral',
    criadoEm: new Date().toISOString(),
    artefatos: [],
    ...overrides,
  }
}

const DFD = {
  id: 'a1', tipo: 'dfd', versao: 1, status: 'aprovado', modeloUsado: 'gemini-2.5-flash',
  tokensInput: null, tokensOutput: null, criadoEm: new Date().toISOString(), aprovadoEm: new Date().toISOString(),
} as const
const ETP = { ...DFD, id: 'a2', tipo: 'etp' } as const
const TR = { ...DFD, id: 'a3', tipo: 'tr' } as const
const EDITAL = { ...DFD, id: 'a4', tipo: 'edital' } as const
const PARECER = { ...DFD, id: 'a5', tipo: 'parecer' } as const

describe('Compliance Engine', () => {
  it('bloqueia processo sem DFD (art. 12 VII)', () => {
    const summary = summarizeCompliance({
      processo: makeProcesso(),
      riscos: [],
      estimativas: [],
    })
    const dfd = summary.checks.find((c) => c.id === 'dfd-presente')
    expect(dfd?.passed).toBe(false)
    expect(dfd?.severity).toBe('critica')
    expect(dfd?.citation?.lei).toBe('Lei 14.133/2021')
    expect(summary.canPublish).toBe(false)
  })

  it('bloqueia processo sem ETP (art. 18)', () => {
    const summary = summarizeCompliance({
      processo: makeProcesso({ artefatos: [{ ...DFD }] }),
      riscos: [],
      estimativas: [],
    })
    const etp = summary.checks.find((c) => c.id === 'etp-presente')
    expect(etp?.passed).toBe(false)
    expect(etp?.severity).toBe('critica')
  })

  it('aprova processo completo quando tudo presente', () => {
    const summary = summarizeCompliance({
      processo: makeProcesso({
        artefatos: [{ ...DFD }, { ...ETP }, { ...TR }, { ...EDITAL }, { ...PARECER }],
      }),
      riscos: [
        {
          id: 'r1', fase: 'planejamento', descricao: 'Risco A',
          probabilidade: 'baixa', impacto: 'baixo', nivelRisco: 'baixo',
          responsavel: 'contratante', tratamento: 't', mitigacao: 'm',
        },
      ] as Risco[],
      estimativas: [
        {
          itemDescricao: 'papel A4', qtdAmostras: 5, media: 25, mediana: 24,
          menor: 20, maior: 30, desvioPadrao: 3, cv: 10, metodo: 'mediana',
          valorFinal: 24, calculadoEm: new Date().toISOString(),
        },
      ] as EstimativaRow[],
    })
    expect(summary.canPublish).toBe(true)
    expect(summary.criticas).toBe(0)
  })

  it('exige matriz de riscos em grande vulto (> R$ 200M)', () => {
    const summary = summarizeCompliance({
      processo: makeProcesso({ valorEstimado: 250_000_000, artefatos: [{ ...DFD }, { ...ETP }] }),
      riscos: [],
      estimativas: [],
    })
    const matriz = summary.checks.find((c) => c.id === 'matriz-riscos-grande-vulto')
    expect(matriz).toBeDefined()
    expect(matriz?.passed).toBe(false)
    expect(matriz?.severity).toBe('critica')
  })

  it('bloqueia pesquisa de preços com menos de 3 fontes (Acórdão TCU 1.875/2021)', () => {
    const summary = summarizeCompliance({
      processo: makeProcesso({ artefatos: [{ ...DFD }, { ...ETP }] }),
      riscos: [],
      estimativas: [
        {
          itemDescricao: 'papel A4', qtdAmostras: 2, media: 25, mediana: 24,
          menor: 20, maior: 30, desvioPadrao: 3, cv: 10, metodo: 'mediana',
          valorFinal: 24, calculadoEm: new Date().toISOString(),
        },
      ] as EstimativaRow[],
    })
    const cesta = summary.checks.find((c) => c.id === 'pesquisa-precos-minimo')
    expect(cesta?.passed).toBe(false)
    expect(cesta?.severity).toBe('alta')
    expect(cesta?.citation?.acordao).toBe('Acórdão TCU 1.875/2021')
  })

  it('sinaliza CV > 25% como média severidade', () => {
    const summary = summarizeCompliance({
      processo: makeProcesso({ artefatos: [{ ...DFD }, { ...ETP }] }),
      riscos: [],
      estimativas: [
        {
          itemDescricao: 'cadeira ergonômica', qtdAmostras: 4, media: 500, mediana: 480,
          menor: 300, maior: 900, desvioPadrao: 200, cv: 40, metodo: 'mediana',
          valorFinal: 480, calculadoEm: new Date().toISOString(),
        },
      ] as EstimativaRow[],
    })
    const cv = summary.checks.find((c) => c.id === 'precos-coef-variacao')
    expect(cv?.passed).toBe(false)
    expect(cv?.severity).toBe('media')
  })
})

describe('runComplianceChecks returns consistent schema', () => {
  it('every check has id, label, detail', () => {
    const checks = runComplianceChecks({
      processo: makeProcesso(),
      riscos: [],
      estimativas: [],
    })
    for (const c of checks) {
      expect(c.id).toBeTypeOf('string')
      expect(c.label).toBeTypeOf('string')
      expect(c.detail).toBeTypeOf('string')
      expect(typeof c.passed).toBe('boolean')
    }
  })
})
