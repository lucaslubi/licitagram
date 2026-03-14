/**
 * Test: Keyword Matcher Precision for IT Company (CNAE 62)
 *
 * Validates that:
 * 1. Irrelevant tenders (shooting ranges, construction, legal, etc.) are BLOCKED
 * 2. Relevant IT tenders are MATCHED with appropriate scores
 * 3. CNAE gate blocks sectors that don't overlap
 *
 * Run: npx tsx packages/workers/src/scripts/test-matcher-precision.ts
 */

import { CNAE_DIVISIONS, getCompanyDivisions } from '@licitagram/shared'

// ─── Inline matcher logic (same as keyword-matcher.ts v3) ─────────────────

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos', 'para',
  'com', 'por', 'uma', 'um', 'que', 'ao', 'aos', 'ou', 'e', 'o', 'a',
  'os', 'as', 'se', 'ser', 'como', 'mais', 'tem', 'sua', 'seu', 'seus',
  'suas', 'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'isso',
  'aquele', 'aquela', 'nao', 'sim', 'muito', 'pouco', 'bem', 'mal',
  'ate', 'sobre', 'entre', 'apos', 'antes', 'durante', 'sob', 'contra',
  'desde', 'conforme', 'segundo', 'quando', 'onde', 'quem', 'qual',
  'quanto', 'todo', 'toda', 'todos', 'todas', 'cada', 'outro', 'outra',
  'outros', 'outras', 'mesmo', 'mesma', 'ja', 'ainda', 'tambem', 'apenas',
  'contratacao', 'aquisicao', 'prestacao', 'servico', 'servicos', 'fornecimento',
  'empresa', 'objeto', 'licitacao', 'pregao', 'edital', 'item', 'itens',
  'lote', 'lotes', 'valor', 'preco', 'registro', 'precos', 'ata',
  'processo', 'numero', 'tipo', 'modalidade', 'orgao', 'entidade',
  'publica', 'publico', 'federal', 'estadual', 'municipal', 'governo',
  'secretaria', 'ministerio', 'departamento', 'diretoria', 'coordenacao',
  'referente', 'conforme', 'descrito', 'abaixo', 'acima', 'seguinte',
  'forma', 'modo', 'acordo', 'termos', 'condicoes', 'especificacoes',
  'atender', 'necessidade', 'demanda', 'solicitacao', 'requisicao',
])

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokenize(text: string): string[] {
  return normalizeText(text).split(' ').filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

function computePhraseScore(phrases: string[][], tenderTokens: Set<string>): { score: number; phraseMatches: number; matchedPhrases: string[] } {
  if (phrases.length === 0 || tenderTokens.size === 0) return { score: 0, phraseMatches: 0, matchedPhrases: [] }
  const matchedPhrases: string[] = []
  for (const phrase of phrases) {
    if (phrase.length > 0 && phrase.every((t) => tenderTokens.has(t))) {
      matchedPhrases.push(phrase.join(' '))
    }
  }
  const phraseMatches = matchedPhrases.length
  if (phraseMatches === 0) return { score: 0, phraseMatches: 0, matchedPhrases: [] }
  const score = Math.min(100, phraseMatches * 12 + 6)
  return { score, phraseMatches, matchedPhrases }
}

function computeDescScore(descTokens: Set<string>, tenderTokens: Set<string>): number {
  if (descTokens.size === 0 || tenderTokens.size === 0) return 0
  let matches = 0
  for (const token of descTokens) { if (tenderTokens.has(token)) matches++ }
  if (matches === 0) return 0
  return Math.round((matches / descTokens.size) * 100)
}

function computeCNAEScore(companyCnaes: string[], tenderCnaeDivisions: string[]): number {
  if (companyCnaes.length === 0 || tenderCnaeDivisions.length === 0) return 0
  const { direct, related } = getCompanyDivisions(companyCnaes)
  let best = 0
  for (const div of tenderCnaeDivisions) {
    if (direct.has(div)) { best = 100; break }
    if (related.has(div)) best = Math.max(best, 50)
  }
  return best
}

// ─── Simulated IT Company ─────────────────────────────────────────────────

const IT_COMPANY = {
  cnae_principal: '62.01-5',
  cnaes_secundarios: ['63.11-9', '95.11-8'],
  palavras_chave: ['desenvolvimento web', 'sistema de gestão', 'aplicativo mobile', 'infraestrutura de rede', 'suporte técnico de TI', 'consultoria em tecnologia'],
  descricao_servicos: 'Empresa de tecnologia da informação especializada em desenvolvimento de software sob demanda, consultoria em TI, suporte técnico, infraestrutura de redes, cloud computing, segurança da informação e integração de sistemas.',
  capacidades: ['desenvolvimento software', 'suporte técnico', 'infraestrutura cloud', 'segurança cibernética'],
}

// Build company data
function buildCompanyData() {
  const allCnaes = [IT_COMPANY.cnae_principal, ...IT_COMPANY.cnaes_secundarios]

  const cnaePhrases: string[][] = []
  for (const cnae of allCnaes) {
    const div = cnae.substring(0, 2)
    const division = CNAE_DIVISIONS[div]
    if (division) {
      for (const kw of division.keywords) {
        const tokens = tokenize(kw)
        if (tokens.length > 0) cnaePhrases.push(tokens)
      }
    }
  }

  const userPhrases: string[][] = []
  for (const kw of IT_COMPANY.palavras_chave) {
    const tokens = tokenize(kw)
    if (tokens.length > 0) userPhrases.push(tokens)
  }
  for (const cap of IT_COMPANY.capacidades) {
    const tokens = tokenize(cap)
    if (tokens.length > 0) userPhrases.push(tokens)
  }

  const descTokens = new Set(tokenize(IT_COMPANY.descricao_servicos))

  return { cnaePhrases, userPhrases, descTokens, allCnaes }
}

// ─── Test Cases ───────────────────────────────────────────────────────────

interface TestCase {
  objeto: string
  tenderCnaes: string[]   // Simulated CNAE classification of the tender
  shouldMatch: boolean     // Expected result
  category: string         // For reporting
}

const TEST_CASES: TestCase[] = [
  // ═══ MUST NOT MATCH (irrelevant to IT company) ═══

  // Military / Security
  { objeto: 'Aquisição de munição calibre 9mm e .40 para a Polícia Militar do Estado', tenderCnaes: ['25'], shouldMatch: false, category: 'Militar/Segurança' },
  { objeto: 'Contratação de empresa para construção de stand de tiro coberto nas dependências do quartel', tenderCnaes: ['41', '42'], shouldMatch: false, category: 'Militar/Segurança' },
  { objeto: 'Aquisição de armamento letal e não letal para a Guarda Municipal', tenderCnaes: ['25'], shouldMatch: false, category: 'Militar/Segurança' },
  { objeto: 'Contratação de segurança patrimonial armada para prédios públicos', tenderCnaes: ['80'], shouldMatch: false, category: 'Militar/Segurança' },

  // Construction / Engineering
  { objeto: 'Construção de galpão industrial para armazenamento de grãos', tenderCnaes: ['41'], shouldMatch: false, category: 'Construção' },
  { objeto: 'Obra de pavimentação asfáltica e drenagem pluvial na Rua XV de Novembro', tenderCnaes: ['42'], shouldMatch: false, category: 'Construção' },
  { objeto: 'Reforma e ampliação da Escola Municipal José de Alencar, incluindo cobertura, pintura e instalações elétricas', tenderCnaes: ['41', '43'], shouldMatch: false, category: 'Construção' },
  { objeto: 'Construção de ponte sobre o Rio Paraná com extensão de 200 metros', tenderCnaes: ['42'], shouldMatch: false, category: 'Construção' },
  { objeto: 'Serviço de terraplanagem e compactação de solo para base de aterro sanitário', tenderCnaes: ['42', '38'], shouldMatch: false, category: 'Construção' },
  { objeto: 'Execução de rede de esgoto sanitário e ligações domiciliares no bairro Jardim América', tenderCnaes: ['42', '37'], shouldMatch: false, category: 'Construção' },

  // Legal / Accounting
  { objeto: 'Contratação de escritório de advocacia para assessoria jurídica ao município', tenderCnaes: ['69'], shouldMatch: false, category: 'Jurídico' },
  { objeto: 'Serviços de auditoria contábil independente para análise das contas do exercício 2025', tenderCnaes: ['69'], shouldMatch: false, category: 'Jurídico' },
  { objeto: 'Contratação de perícia contábil e avaliação patrimonial', tenderCnaes: ['69'], shouldMatch: false, category: 'Jurídico' },

  // Food / Catering
  { objeto: 'Aquisição de gêneros alimentícios para merenda escolar: arroz, feijão, açúcar, óleo', tenderCnaes: ['10', '56'], shouldMatch: false, category: 'Alimentação' },
  { objeto: 'Fornecimento de refeições transportadas para servidores do hospital municipal', tenderCnaes: ['56'], shouldMatch: false, category: 'Alimentação' },
  { objeto: 'Contratação de serviço de buffet para eventos institucionais', tenderCnaes: ['56'], shouldMatch: false, category: 'Alimentação' },

  // Healthcare
  { objeto: 'Aquisição de medicamentos da farmácia básica e materiais hospitalares', tenderCnaes: ['21', '32'], shouldMatch: false, category: 'Saúde' },
  { objeto: 'Contratação de cirurgias de catarata por facoemulsificação', tenderCnaes: ['86'], shouldMatch: false, category: 'Saúde' },
  { objeto: 'Aquisição de equipamentos médico-hospitalares: monitores cardíacos, desfibriladores e oxímetros', tenderCnaes: ['32', '86'], shouldMatch: false, category: 'Saúde' },

  // Vehicles / Fleet
  { objeto: 'Aquisição de veículos automotores tipo sedan para frota administrativa', tenderCnaes: ['45', '29'], shouldMatch: false, category: 'Veículos' },
  { objeto: 'Manutenção preventiva e corretiva de veículos pesados (ônibus e caminhões)', tenderCnaes: ['45'], shouldMatch: false, category: 'Veículos' },
  { objeto: 'Aquisição de peças e componentes para veículos da frota municipal', tenderCnaes: ['45'], shouldMatch: false, category: 'Veículos' },

  // Cleaning / Maintenance
  { objeto: 'Contratação de empresa especializada em limpeza e conservação predial', tenderCnaes: ['81'], shouldMatch: false, category: 'Limpeza' },
  { objeto: 'Serviço de desinsetização, desratização e limpeza de caixa d\'água', tenderCnaes: ['81'], shouldMatch: false, category: 'Limpeza' },
  { objeto: 'Coleta de resíduos sólidos urbanos e varrição de logradouros públicos', tenderCnaes: ['38', '81'], shouldMatch: false, category: 'Limpeza' },

  // Agriculture
  { objeto: 'Aquisição de sementes e mudas para programa de reflorestamento municipal', tenderCnaes: ['01', '02'], shouldMatch: false, category: 'Agricultura' },
  { objeto: 'Contratação de serviço de mecanização agrícola: aração e gradagem', tenderCnaes: ['01'], shouldMatch: false, category: 'Agricultura' },

  // Furniture / Office (physical)
  { objeto: 'Aquisição de mobiliário escolar: carteiras, cadeiras e mesas para alunos', tenderCnaes: ['31'], shouldMatch: false, category: 'Mobiliário' },
  { objeto: 'Fornecimento de material de expediente: papel A4, canetas, pastas, grampeadores', tenderCnaes: ['17', '47'], shouldMatch: false, category: 'Material' },

  // Energy / Utilities
  { objeto: 'Instalação de sistema de energia solar fotovoltaica nas unidades de saúde', tenderCnaes: ['35', '43'], shouldMatch: false, category: 'Energia' },
  { objeto: 'Manutenção da rede de iluminação pública do município', tenderCnaes: ['35', '43'], shouldMatch: false, category: 'Energia' },

  // Clothing / Uniforms (with misleading words)
  { objeto: 'Aquisição de uniformes e EPIs para servidores da secretaria de obras', tenderCnaes: ['14'], shouldMatch: false, category: 'Vestuário' },
  { objeto: 'Confecção de fardamento para agentes de segurança patrimonial', tenderCnaes: ['14'], shouldMatch: false, category: 'Vestuário' },

  // Education (non-IT)
  { objeto: 'Contratação de empresa de transporte escolar para zona rural', tenderCnaes: ['49', '85'], shouldMatch: false, category: 'Educação' },
  { objeto: 'Aquisição de livros didáticos e paradidáticos para biblioteca municipal', tenderCnaes: ['85', '47'], shouldMatch: false, category: 'Educação' },

  // Events (non-IT)
  { objeto: 'Contratação de palco, som e iluminação para festa junina municipal', tenderCnaes: ['90', '79'], shouldMatch: false, category: 'Eventos' },
  { objeto: 'Locação de tendas, mesas, cadeiras e banheiros químicos para evento esportivo', tenderCnaes: ['77', '79'], shouldMatch: false, category: 'Eventos' },

  // Water / Sanitation
  { objeto: 'Perfuração de poço artesiano profundo e instalação de bomba submersa', tenderCnaes: ['36'], shouldMatch: false, category: 'Água' },
  { objeto: 'Fornecimento de água potável por carro-pipa para comunidades rurais', tenderCnaes: ['36'], shouldMatch: false, category: 'Água' },

  // Real Estate
  { objeto: 'Locação de imóvel comercial para funcionamento da secretaria de saúde', tenderCnaes: ['68'], shouldMatch: false, category: 'Imobiliário' },

  // ═══ TRICKY — Should NOT match despite containing IT-adjacent words ═══

  { objeto: 'Contratação de sistema de segurança eletrônica: câmeras CCTV, alarmes e controle de acesso para prédios', tenderCnaes: ['80', '43'], shouldMatch: false, category: 'Segurança Eletrônica' },
  { objeto: 'Instalação de rede de proteção e telas de segurança em janelas do prédio escolar', tenderCnaes: ['43'], shouldMatch: false, category: 'Construção' },
  { objeto: 'Monitoramento ambiental de fauna e flora na área de preservação permanente', tenderCnaes: ['74', '71'], shouldMatch: false, category: 'Meio Ambiente' },
  { objeto: 'Desenvolvimento urbano: programa de regularização fundiária e infraestrutura', tenderCnaes: ['42', '68'], shouldMatch: false, category: 'Urbanismo' },
  { objeto: 'Contratação de plataforma elevatória para acessibilidade de cadeirantes', tenderCnaes: ['28', '43'], shouldMatch: false, category: 'Acessibilidade' },
  { objeto: 'Automação de portões e cancelas do estacionamento municipal', tenderCnaes: ['43', '28'], shouldMatch: false, category: 'Automação Física' },

  // ═══ MUST MATCH (relevant to IT company) ═══

  // Direct IT services
  { objeto: 'Contratação de empresa para desenvolvimento de software de gestão escolar', tenderCnaes: ['62'], shouldMatch: true, category: 'TI Direto' },
  { objeto: 'Licenciamento de software antivírus e firewall para 500 estações de trabalho', tenderCnaes: ['62'], shouldMatch: true, category: 'TI Direto' },
  { objeto: 'Contratação de serviço de suporte técnico e manutenção de equipamentos de informática', tenderCnaes: ['62', '95'], shouldMatch: true, category: 'TI Direto' },
  { objeto: 'Desenvolvimento e implantação de sistema ERP integrado para a prefeitura', tenderCnaes: ['62'], shouldMatch: true, category: 'TI Direto' },
  { objeto: 'Contratação de serviço de hospedagem em cloud computing e backup em nuvem', tenderCnaes: ['62', '63'], shouldMatch: true, category: 'TI Direto' },
  { objeto: 'Consultoria em segurança da informação e adequação à LGPD', tenderCnaes: ['62'], shouldMatch: true, category: 'TI Direto' },
  { objeto: 'Desenvolvimento de aplicativo mobile para consulta de protocolo e serviços ao cidadão', tenderCnaes: ['62'], shouldMatch: true, category: 'TI Direto' },
  { objeto: 'Implantação de sistema de prontuário eletrônico do paciente (PEP) nas UBS', tenderCnaes: ['62'], shouldMatch: true, category: 'TI Direto' },
  { objeto: 'Contratação de empresa para criação de portal web e site institucional responsivo', tenderCnaes: ['62'], shouldMatch: true, category: 'TI Direto' },
  { objeto: 'Manutenção e suporte de banco de dados Oracle e SQL Server', tenderCnaes: ['62'], shouldMatch: true, category: 'TI Direto' },
  { objeto: 'Fornecimento de licença de software de gestão de frotas e rastreamento veicular', tenderCnaes: ['62'], shouldMatch: true, category: 'TI Direto' },
  { objeto: 'Contratação de serviço de outsourcing de TI com help desk e suporte N1/N2/N3', tenderCnaes: ['62'], shouldMatch: true, category: 'TI Direto' },
  { objeto: 'Implantação de infraestrutura de rede lógica e cabeamento estruturado', tenderCnaes: ['62', '61'], shouldMatch: true, category: 'TI Direto' },

  // IT Hardware (related — should match via CNAE 95 secondary)
  { objeto: 'Aquisição de computadores desktop, notebooks e impressoras para informatização do setor', tenderCnaes: ['26', '95'], shouldMatch: true, category: 'TI Hardware' },
  { objeto: 'Manutenção preventiva e corretiva de equipamentos de informática (computadores e impressoras)', tenderCnaes: ['95'], shouldMatch: true, category: 'TI Hardware' },

  // IT-adjacent (data, hosting)
  { objeto: 'Contratação de serviço de datacenter e colocation para servidores da prefeitura', tenderCnaes: ['63'], shouldMatch: true, category: 'TI Adjacente' },
  { objeto: 'Serviço de digitalização de documentos e implantação de gestão eletrônica de documentos (GED)', tenderCnaes: ['62', '63'], shouldMatch: true, category: 'TI Adjacente' },

  // NO CNAE classification (must pass keyword-only mode)
  { objeto: 'Contratação de empresa de tecnologia para desenvolvimento de software e sistema de gestão integrado com módulos de RH, financeiro e almoxarifado', tenderCnaes: [], shouldMatch: true, category: 'TI sem CNAE' },
  { objeto: 'Suporte técnico em informática, manutenção de computadores, instalação de software e configuração de rede', tenderCnaes: [], shouldMatch: true, category: 'TI sem CNAE' },
]

// ─── Run Tests ────────────────────────────────────────────────────────────

function runTests() {
  const company = buildCompanyData()
  const allPhrases = [...company.cnaePhrases, ...company.userPhrases]

  let passed = 0
  let failed = 0
  const failures: string[] = []

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  MATCHER v3 PRECISION TEST — IT Company (CNAE 62)')
  console.log('═══════════════════════════════════════════════════════════════\n')

  // Show company phrases
  console.log(`📋 Company has ${company.cnaePhrases.length} CNAE phrases + ${company.userPhrases.length} user phrases`)
  console.log(`📋 Description has ${company.descTokens.size} tokens\n`)

  for (const tc of TEST_CASES) {
    const tenderTokens = new Set(tokenize(tc.objeto))
    const { score: kwScore, phraseMatches, matchedPhrases } = computePhraseScore(allPhrases, tenderTokens)
    const descScore = computeDescScore(company.descTokens, tenderTokens)

    const hasCnaes = tc.tenderCnaes.length > 0
    let cnaeScore = 0
    if (hasCnaes) {
      cnaeScore = computeCNAEScore(company.allCnaes, tc.tenderCnaes)
    }

    let finalScore: number
    let blocked = false
    let blockReason = ''

    if (hasCnaes) {
      // Mode A: CNAE-Gated
      if (cnaeScore === 0) {
        finalScore = 0
        blocked = true
        blockReason = 'CNAE gate (no overlap)'
      } else {
        finalScore = Math.round(kwScore * 0.35 + cnaeScore * 0.40 + descScore * 0.25)
        if (finalScore < 40) {
          blocked = true
          blockReason = `Score ${finalScore} < 40`
        }
      }
    } else {
      // Mode B: Keyword-only
      if (phraseMatches < 3) {
        finalScore = Math.round(kwScore * 0.60 + descScore * 0.40)
        blocked = true
        blockReason = `Only ${phraseMatches} phrase matches (need 3+)`
      } else {
        finalScore = Math.round(kwScore * 0.60 + descScore * 0.40)
        if (finalScore < 50) {
          blocked = true
          blockReason = `Score ${finalScore} < 50`
        }
      }
    }

    const wouldMatch = !blocked
    const correct = wouldMatch === tc.shouldMatch
    const icon = correct ? '✅' : '❌'

    if (!correct) {
      failed++
      const detail = wouldMatch
        ? `FALSE POSITIVE — Score: ${finalScore}, Phrases: ${phraseMatches} [${matchedPhrases.join(', ')}], CNAE: ${cnaeScore}`
        : `FALSE NEGATIVE — ${blockReason}, kwScore: ${kwScore}, Phrases: ${phraseMatches} [${matchedPhrases.join(', ')}]`
      failures.push(`${tc.category}: "${tc.objeto.substring(0, 80)}..." → ${detail}`)
      console.log(`${icon} [${tc.category}] "${tc.objeto.substring(0, 70)}..."`)
      console.log(`   ↳ Expected: ${tc.shouldMatch ? 'MATCH' : 'NO MATCH'} | Got: ${wouldMatch ? 'MATCH' : 'NO MATCH'}`)
      console.log(`   ↳ Score: ${finalScore} | KW: ${kwScore} | CNAE: ${cnaeScore} | Desc: ${descScore} | Phrases: ${phraseMatches}`)
      if (matchedPhrases.length > 0) console.log(`   ↳ Matched: [${matchedPhrases.join(', ')}]`)
      if (blockReason) console.log(`   ↳ Block: ${blockReason}`)
    } else {
      passed++
      if (wouldMatch) {
        console.log(`${icon} [${tc.category}] Score: ${finalScore} | Phrases: ${phraseMatches} → "${tc.objeto.substring(0, 60)}..."`)
      } else {
        const reason = blockReason || 'blocked'
        console.log(`${icon} [${tc.category}] ${reason} → "${tc.objeto.substring(0, 60)}..."`)
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log(`  RESULTS: ${passed} passed, ${failed} failed out of ${TEST_CASES.length}`)
  console.log(`  Precision: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%`)
  console.log('═══════════════════════════════════════════════════════════════')

  if (failures.length > 0) {
    console.log('\n🔴 FAILURES:')
    for (const f of failures) {
      console.log(`  • ${f}`)
    }
  }

  // Summary by category
  const shouldNotMatch = TEST_CASES.filter((t) => !t.shouldMatch)
  const shouldMatch = TEST_CASES.filter((t) => t.shouldMatch)
  const falsePositives = shouldNotMatch.filter((tc) => {
    const tenderTokens = new Set(tokenize(tc.objeto))
    const { phraseMatches } = computePhraseScore(allPhrases, tenderTokens)
    const cnaeScore = tc.tenderCnaes.length > 0 ? computeCNAEScore(company.allCnaes, tc.tenderCnaes) : 0
    if (tc.tenderCnaes.length > 0 && cnaeScore === 0) return false
    if (tc.tenderCnaes.length === 0 && phraseMatches < 3) return false
    const kwScore = computePhraseScore(allPhrases, tenderTokens).score
    const descScore = computeDescScore(company.descTokens, tenderTokens)
    const finalScore = tc.tenderCnaes.length > 0
      ? Math.round(kwScore * 0.35 + cnaeScore * 0.40 + descScore * 0.25)
      : Math.round(kwScore * 0.60 + descScore * 0.40)
    const minScore = tc.tenderCnaes.length > 0 ? 40 : 50
    return finalScore >= minScore
  })

  console.log(`\n📊 Summary:`)
  console.log(`  Should NOT match: ${shouldNotMatch.length} cases → ${falsePositives.length} false positives`)
  console.log(`  Should match: ${shouldMatch.length} cases → ${shouldMatch.length - (failed - falsePositives.length)} true positives`)
  console.log(`  False positive rate: ${((falsePositives.length / shouldNotMatch.length) * 100).toFixed(1)}%`)
}

runTests()
