/**
 * Standalone test of the local CNAE keyword classifier
 * No external dependencies (no supabase, no redis)
 * Run: packages/workers/node_modules/.bin/tsx packages/workers/src/scripts/test-local-classifier.ts
 */
import { CNAE_DIVISIONS } from '@licitagram/shared'

// ─── Inline copy of classifier logic (to avoid import chain with redis/supabase) ──

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function stem(word: string): string {
  if (word.length <= 4) return word
  let w = word
  // Phase 1: Normalize plural forms
  if (w.length > 5 && w.endsWith('oes')) w = w.slice(0, -3)
  else if (w.length > 5 && w.endsWith('aes')) w = w.slice(0, -2)
  else if (w.length > 5 && w.endsWith('ais')) w = w.slice(0, -2)
  else if (w.length > 5 && w.endsWith('eis')) w = w.slice(0, -2)
  else if (w.length > 5 && w.endsWith('es')) w = w.slice(0, -2)
  else if (w.length > 4 && w.endsWith('s')) w = w.slice(0, -1)
  // Phase 2: Remove derivational suffixes
  const suffixes = [
    'amento', 'imento', 'mente', 'encia', 'ancia', 'avel', 'ivel',
    'acao', 'icao', 'oria', 'aria', 'eiro', 'eira', 'ista', 'ismo',
    'ante', 'ente', 'inte', 'endo', 'indo', 'ando',
    'tico', 'tica', 'ario',
    'ado', 'ido', 'oso', 'osa', 'ivo', 'iva',
    'or', 'al', 'ar', 'er', 'ir',
  ]
  for (const suffix of suffixes) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) {
      return w.slice(0, -suffix.length)
    }
  }
  return w
}

const STOP = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos', 'para',
  'com', 'por', 'uma', 'um', 'que', 'ao', 'aos', 'ou', 'e', 'o', 'a',
  'os', 'as', 'se', 'ser', 'como', 'mais', 'tem', 'sua', 'seu', 'seus',
  'nao', 'sim', 'muito', 'pouco', 'bem', 'mal', 'ate', 'sobre', 'entre',
  'apos', 'antes', 'durante', 'sob', 'contra', 'desde', 'quando', 'onde',
  'quem', 'qual', 'quanto', 'todo', 'toda', 'todos', 'todas', 'cada',
  'outro', 'outra', 'mesmo', 'mesma', 'apenas', 'ainda', 'tambem',
  'presente', 'conforme', 'abaixo', 'acima', 'seguinte', 'referente',
])

function tok(text: string): string[] {
  return normalizeText(text).split(' ').filter((w) => w.length >= 3 && !STOP.has(w))
}

// Pre-compute division data
interface DivData { kwTokens: string[][]; kwStems: Set<string>[]; nomeTokens: string[]; nomeStems: Set<string>; descStems: Set<string> }
const DIV: Record<string, DivData> = {}
for (const [div, data] of Object.entries(CNAE_DIVISIONS)) {
  const kwTokens = data.keywords.map((kw: string) => tok(kw)).filter((t: string[]) => t.length > 0)
  const kwStems = kwTokens.map((tokens: string[]) => new Set(tokens.map(stem)))
  const nomeTokens = tok(data.nome)
  DIV[div] = {
    kwTokens, kwStems,
    nomeTokens,
    nomeStems: new Set(nomeTokens.map(stem)),
    descStems: new Set(tok(data.descricao || '').map(stem)),
  }
}

function classifyLocal(objeto: string) {
  const textTokens = tok(objeto)
  const textTokenSet = new Set(textTokens)
  const textStems = new Set(textTokens.map(stem))
  const scores: Array<{ div: string; score: number }> = []

  for (const [div, data] of Object.entries(DIV)) {
    let s = 0
    for (const kwT of data.kwTokens) {
      if (kwT.every((t) => textTokenSet.has(t))) s += 1.0
    }
    for (let i = 0; i < data.kwStems.length; i++) {
      if (!data.kwTokens[i].every((t) => textTokenSet.has(t))) {
        if ([...data.kwStems[i]].every((st) => textStems.has(st)) && data.kwStems[i].size > 0) s += 0.7
      }
    }
    let nb = 0
    for (const t of data.nomeTokens) { if (textTokenSet.has(t) || textStems.has(stem(t))) nb += 0.5 }
    s += Math.min(nb, 1.5)
    let db = 0
    for (const st of data.descStems) { if (st.length >= 4 && textStems.has(st)) db += 0.3 }
    s += Math.min(db, 1.5)
    if (s >= 2.0) scores.push({ div, score: Math.round(s * 10) / 10 })
  }

  const sorted = scores.sort((a, b) => b.score - a.score).slice(0, 5)
  const topScore = sorted[0]?.score || 0
  return { divisions: sorted.map((x) => x.div), confidence: topScore >= 3.0 ? 'high' as const : 'low' as const, topScore, details: sorted }
}

// ── Tests ──
const tests: Array<{ obj: string; expected: string; expectedDivs: string[] }> = [
  { obj: 'Registro de Preços para fornecimento de mão de obra especializada destinada à construção de Módulos Habitacionais', expected: 'Construção', expectedDivs: ['41', '43'] },
  { obj: 'Execução De Obra De Pavimentação Asfáltica (Cbuq), Drenagem Pluvial E Sinalização Viária Para Prolongamento', expected: 'Infra', expectedDivs: ['42'] },
  { obj: 'Contratação de empresa de engenharia para Reforma da Escola Estadual Vicente Celso Brandão', expected: 'Edificações', expectedDivs: ['41', '43'] },
  { obj: 'Pavimentação asfáltica de vias urbana em CBUQ incluindo terraplenagem base sub-base revestimento meio-fio sarjeta sinalização', expected: 'Pavimentação', expectedDivs: ['42'] },
  { obj: 'Contratação de empresa especializada em engenharia e arquitetura para elaboração de projetos básicos e executivos de climatização', expected: 'Engenharia', expectedDivs: ['71'] },
  { obj: 'Desenvolvimento de software para gestão hospitalar e sistemas de informação', expected: 'TI', expectedDivs: ['62'] },
  { obj: 'Aquisição de computadores, impressoras e equipamentos de TI', expected: 'Equip. TI', expectedDivs: ['26', '47'] },
  { obj: 'Contratação de pessoa jurídica para fornecimento de equipamentos de monitoramento sistema de alarme instalação e manutenção', expected: 'Segurança', expectedDivs: ['80', '43'] },
  { obj: 'Aquisição de medicamentos da rede comercial destinados à Farmácia Básica Municipal', expected: 'Farmácia', expectedDivs: ['21', '46', '47'] },
  { obj: 'CONTRATACAO DE EMPRESA PARA REALIZACAO DE LAUDOS ELETROCARDIOGRAMA', expected: 'Saúde', expectedDivs: ['86'] },
  { obj: 'Credenciamento de pessoas jurídicas na área médica para prestação de serviços de saúde', expected: 'Saúde', expectedDivs: ['86'] },
  { obj: 'Aquisição de 2 veículos Ambulância Tipo A para transporte de pacientes', expected: 'Veículos/Saúde', expectedDivs: ['29', '45', '86'] },
  { obj: 'Serviços de limpeza conservação e jardinagem predial', expected: 'Limpeza', expectedDivs: ['81'] },
  { obj: 'Manutenção preventiva e corretiva de ar condicionado', expected: 'Manutenção', expectedDivs: ['43', '33'] },
  { obj: 'Fornecimento de refeições transportadas para alimentação escolar', expected: 'Alimentação', expectedDivs: ['56'] },
  { obj: 'CONTRATAÇÃO DE EMPRESA PARA FORNECIMENTO DE HIPOCLORITO DE SÓDIO PARA TRATAMENTO DE ÁGUA', expected: 'Químico/Água', expectedDivs: ['20', '36'] },
  { obj: 'CONTRATAÇÃO DE EMPRESA PARA PRESTAÇÃO DE SERVIÇOS DE TRANSPORTE ESCOLAR', expected: 'Transporte', expectedDivs: ['49'] },
  { obj: 'CONTRATAÇÃO DE PRESTADOR DE SERVIÇO PARA COLETA TRANSPORTE E DISTRIBUIÇÃO DE ÁGUA POTÁVEL OPERAÇÃO CARRO PIPA', expected: 'Transp/Água', expectedDivs: ['49', '36'] },
  { obj: 'CONTRATAÇÃO DE EMPRESA PARA AGENCIAMENTO DE VIAGENS RESERVA EMISSÃO MARCAÇÃO DE BILHETES DE PASSAGENS', expected: 'Viagens', expectedDivs: ['79'] },
  { obj: 'Solução educacional em Educação Étnico-Racial e Cultura Afro-Brasileira destinada aos alunos', expected: 'Educação', expectedDivs: ['85'] },
  { obj: 'Curso de Capacitação de Dirigentes da Unidade Gestora', expected: 'Educação', expectedDivs: ['85'] },
  { obj: 'CONTRATAÇÃO DE EMPRESA PARA TREINAMENTO CURSO ON-LINE DE FORMAÇÃO EM LICITAÇÕES E CONTRATOS', expected: 'Educação', expectedDivs: ['85'] },
  { obj: 'CONTRATAÇÃO DO CANTOR CAIO LIVIO PARA APRESENTAÇÃO ARTÍSTICA DURANTE O CARNAVAL 2026', expected: 'Artes', expectedDivs: ['90', '93'] },
  { obj: 'CONTRATAÇÃO DE EMPRESA PARA SHOW ARTÍSTICO COM A DUPLA BRUNO E BARRETTO NA FESTA DO PEÃO', expected: 'Artes', expectedDivs: ['90', '93'] },
  { obj: 'CONTRATAÇÃO DE SERVIÇOS DE ARBITRAGEM ESPORTIVA PARA FUTSAL FUTEBOL BOCHA E VÔLEI', expected: 'Esportes', expectedDivs: ['93'] },
  { obj: 'Aquisição de Carga e Recarga de Extintores de Incêndio e aparelhos de sinalização de segurança', expected: 'Segurança', expectedDivs: ['80', '84'] },
  { obj: 'CONTRATAÇÃO DE CONSULTORIA EM ADMINISTRAÇÃO TRIBUTÁRIA PARA MEDIDAS JUDICIAIS', expected: 'Consultoria', expectedDivs: ['69', '70'] },
  { obj: 'CONTRATAÇÃO DE ASSESSORIA OU CONSULTORIA JURÍDICA ESPECIALIZADA', expected: 'Jurídico', expectedDivs: ['69', '70'] },
  { obj: 'Aquisição de veículo automotor tipo passeio', expected: 'Veículos', expectedDivs: ['29', '45'] },
  { obj: 'Contratação de seguro para a frota de veículos do município', expected: 'Seguros', expectedDivs: ['65'] },
  { obj: 'Aquisição de combustível para abastecimento de veículos', expected: 'Combustível', expectedDivs: ['47'] },
  { obj: 'Processamento de roupas de serviço de saúde com locação de enxoval hospitalar', expected: 'Lavanderia', expectedDivs: ['96'] },
  { obj: 'Aquisição de divisórias modulares do tipo Naval e PVC e portas de divisória', expected: 'Móveis', expectedDivs: ['31', '43'] },
  { obj: 'ILUMINAÇÃO PÚBLICA ENERGIA DE GOIÁS MANUTENÇÃO', expected: 'Energia', expectedDivs: ['35'] },
]

console.log(`=== Teste Classificador CNAE Local v2 (stems) === ${tests.length} tenders\n`)

let highConf = 0, lowConf = 0, correct = 0, partial = 0, wrong = 0, noResult = 0

for (const test of tests) {
  const r = classifyLocal(test.obj)
  if (r.confidence === 'high') highConf++; else lowConf++

  const hasOverlap = r.divisions.some((d) => test.expectedDivs.includes(d))
  const allCorrect = r.divisions.length > 0 && r.divisions.every((d) => test.expectedDivs.includes(d))
  let st: string
  if (r.divisions.length === 0) { st = '⬜'; noResult++ }
  else if (allCorrect) { st = '✅'; correct++ }
  else if (hasOverlap) { st = '🟡'; partial++ }
  else { st = '❌'; wrong++ }

  const divStr = r.details.map((x) => `${x.div}(${x.score})`).join(',') || '-'
  const conf = r.confidence === 'high' ? 'H' : 'L'
  console.log(`${st} [${conf}] ${divStr.padEnd(30)} exp=${test.expectedDivs.join(',')}  ${test.expected}`)
  if (st === '❌') console.log(`   ⚠️  ${r.divisions.map(d => CNAE_DIVISIONS[d]?.nome).join('; ')}`)
}

console.log(`\n═════ RESUMO (${tests.length}) ═════`)
console.log(`✅ ${correct}(${Math.round(correct/tests.length*100)}%) 🟡 ${partial}(${Math.round(partial/tests.length*100)}%) ❌ ${wrong}(${Math.round(wrong/tests.length*100)}%) ⬜ ${noResult}(${Math.round(noResult/tests.length*100)}%)`)
console.log(`HIGH: ${highConf}(${Math.round(highConf/tests.length*100)}%) sem IA | LOW: ${lowConf}(${Math.round(lowConf/tests.length*100)}%) → Gemini`)
console.log(`Precisão(qdo classifica): ${tests.length-noResult > 0 ? Math.round((correct+partial)/(tests.length-noResult)*100) : 0}%`)
console.log(`Cobertura: ${Math.round((tests.length-noResult)/tests.length*100)}% | Economia IA: ${Math.round(highConf/tests.length*100)}%`)
