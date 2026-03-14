/**
 * Comprehensive CNAE Classifier Test Suite — 100+ real tender objects
 * Covers all major sectors, edge cases, short texts, compound objects
 * Run: packages/workers/node_modules/.bin/tsx packages/workers/src/scripts/test-local-classifier-v3.ts
 */
import { CNAE_DIVISIONS } from '@licitagram/shared'

// ─── Inline copy of classifier logic (standalone, no redis/supabase) ──

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function stem(word: string): string {
  if (word.length <= 4) return word
  let w = word
  if (w.length > 5 && w.endsWith('oes')) w = w.slice(0, -3)
  else if (w.length > 5 && w.endsWith('aes')) w = w.slice(0, -2)
  else if (w.length > 5 && w.endsWith('ais')) w = w.slice(0, -2)
  else if (w.length > 5 && w.endsWith('eis')) w = w.slice(0, -2)
  else if (w.length > 5 && w.endsWith('ens')) { w = w.slice(0, -3) + 'em' }
  else if (w.length > 5 && w.endsWith('es') && 'rzs'.includes(w[w.length - 3])) w = w.slice(0, -2)
  else if (w.length >= 4 && w.endsWith('s')) w = w.slice(0, -1)
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

// ─── Pre-compute division data with specificity ──
interface DivData { kwTokens: string[][]; kwStems: Set<string>[]; kwExclusive: boolean[]; nomeTokens: string[]; nomeStems: Set<string>; descStems: Set<string> }
const DIV: Record<string, DivData> = {}

// Step 1: Build all keyword tokens
const _tempKw: Record<string, string[][]> = {}
for (const [div, data] of Object.entries(CNAE_DIVISIONS)) {
  _tempKw[div] = data.keywords.map((kw: string) => tok(kw)).filter((t: string[]) => t.length > 0)
}
// Step 2: Compute exclusivity
const _kwDivCount: Map<string, number> = new Map()
for (const kwList of Object.values(_tempKw)) {
  for (const kwT of kwList) {
    const sig = kwT.map(stem).sort().join('|')
    _kwDivCount.set(sig, (_kwDivCount.get(sig) || 0) + 1)
  }
}
// Step 3: Build final data
for (const [div, data] of Object.entries(CNAE_DIVISIONS)) {
  const kwTokens = _tempKw[div]
  const kwStems = kwTokens.map((tokens: string[]) => new Set(tokens.map(stem)))
  const kwExclusive = kwTokens.map((tokens) => {
    const sig = tokens.map(stem).sort().join('|')
    return (_kwDivCount.get(sig) || 1) <= 2
  })
  const nomeTokens = tok(data.nome)
  DIV[div] = {
    kwTokens, kwStems, kwExclusive, nomeTokens,
    nomeStems: new Set(nomeTokens.map(stem)),
    descStems: new Set(tok(data.descricao || '').map(stem)),
  }
}

// Scoring weights (must match cnae-keyword-classifier.ts)
const EXACT_W = 1.5, STEM_W = 1.0, EXCL_BONUS = 0.5, NAME_W = 0.5, NAME_MAX = 1.5, DESC_W = 0.3, DESC_MAX = 1.5, THRESHOLD = 2.0, HIGH_CONF = 3.0

function classifyLocal(objeto: string) {
  const textTokens = tok(objeto)
  const textTokenSet = new Set(textTokens)
  const textStems = new Set(textTokens.map(stem))
  const scores: Array<{ div: string; score: number; details: string[] }> = []

  for (const [div, data] of Object.entries(DIV)) {
    let s = 0
    const matchDetails: string[] = []
    // 1. Exact keyword matches (1.5 + 0.5 if exclusive)
    for (let i = 0; i < data.kwTokens.length; i++) {
      if (data.kwTokens[i].every((t) => textTokenSet.has(t))) {
        s += EXACT_W
        if (data.kwExclusive[i]) s += EXCL_BONUS
        matchDetails.push(`kw="${data.kwTokens[i].join(' ')}"${data.kwExclusive[i] ? '★' : ''}`)
      }
    }
    // 2. Stem keyword matches (1.0 + 0.5 if exclusive, only if not exact)
    for (let i = 0; i < data.kwStems.length; i++) {
      if (!data.kwTokens[i].every((t) => textTokenSet.has(t))) {
        if ([...data.kwStems[i]].every((st) => textStems.has(st)) && data.kwStems[i].size > 0) {
          s += STEM_W
          if (data.kwExclusive[i]) s += EXCL_BONUS
          matchDetails.push(`stem="${[...data.kwStems[i]].join(' ')}"${data.kwExclusive[i] ? '★' : ''}`)
        }
      }
    }
    // 3. Name bonus
    let nb = 0
    for (const t of data.nomeTokens) { if (textTokenSet.has(t) || textStems.has(stem(t))) nb += NAME_W }
    s += Math.min(nb, NAME_MAX)
    if (nb > 0) matchDetails.push(`nome=${nb.toFixed(1)}`)
    // 4. Description bonus
    let db = 0
    for (const st of data.descStems) { if (st.length >= 4 && textStems.has(st)) db += DESC_W }
    s += Math.min(db, DESC_MAX)
    if (db > 0) matchDetails.push(`desc=${db.toFixed(1)}`)

    if (s >= THRESHOLD) scores.push({ div, score: Math.round(s * 10) / 10, details: matchDetails })
  }

  const sorted = scores.sort((a, b) => b.score - a.score).slice(0, 5)
  const topScore = sorted[0]?.score || 0
  return { divisions: sorted.map((x) => x.div), confidence: topScore >= HIGH_CONF ? 'high' as const : 'low' as const, topScore, details: sorted }
}

// ── COMPREHENSIVE TEST SUITE ──
// 100+ real-world Brazilian tender objects from diverse sectors

interface Test { obj: string; label: string; expected: string[] }

const tests: Test[] = [
  // ═══ CONSTRUÇÃO & ENGENHARIA ═══
  { obj: 'Registro de Preços para fornecimento de mão de obra especializada destinada à construção de Módulos Habitacionais', label: 'Construção habitacional', expected: ['41', '43'] },
  { obj: 'Execução De Obra De Pavimentação Asfáltica (Cbuq), Drenagem Pluvial E Sinalização Viária Para Prolongamento', label: 'Pavimentação', expected: ['42'] },
  { obj: 'Contratação de empresa de engenharia para Reforma da Escola Estadual Vicente Celso Brandão', label: 'Reforma escola', expected: ['41', '43'] },
  { obj: 'Pavimentação asfáltica de vias urbana em CBUQ incluindo terraplenagem base sub-base revestimento meio-fio sarjeta sinalização', label: 'Pavimentação completa', expected: ['42'] },
  { obj: 'Contratação de empresa especializada em engenharia e arquitetura para elaboração de projetos básicos e executivos de climatização', label: 'Engenharia projetos', expected: ['71'] },
  { obj: 'Contratação de empresa para execução de obra de construção civil do prédio da nova sede administrativa', label: 'Construção prédio', expected: ['41'] },
  { obj: 'Obra de ampliação e reforma do Hospital Municipal incluindo instalações elétricas e hidráulicas', label: 'Reforma hospital', expected: ['41', '43'] },
  { obj: 'Serviços de topografia e levantamento planialtimétrico cadastral para regularização fundiária', label: 'Topografia', expected: ['71'] },
  { obj: 'Contratação de empresa para execução de obra de drenagem urbana e galerias pluviais', label: 'Drenagem', expected: ['42'] },
  { obj: 'Serviço de pintura interna e externa de prédios públicos municipais', label: 'Pintura predial', expected: ['43'] },

  // ═══ TECNOLOGIA DA INFORMAÇÃO ═══
  { obj: 'Desenvolvimento de software para gestão hospitalar e sistemas de informação', label: 'Software', expected: ['62'] },
  { obj: 'Aquisição de computadores, impressoras e equipamentos de TI', label: 'Equipamentos TI', expected: ['26', '47'] },
  { obj: 'Contratação de empresa para fornecimento de licenças de software Microsoft Office 365', label: 'Licença software', expected: ['62'] },
  { obj: 'Prestação de serviços de suporte técnico e manutenção em equipamentos de informática', label: 'Suporte TI', expected: ['62', '95'] },
  { obj: 'Contratação de empresa para implantação de sistema ERP integrado de gestão pública', label: 'ERP', expected: ['62'] },
  { obj: 'Aquisição de servidores, storage e equipamentos de rede para o datacenter municipal', label: 'Infraestrutura TI', expected: ['26', '62'] },
  { obj: 'Contratação de link de internet dedicado de fibra óptica com velocidade de 1 Gbps', label: 'Internet', expected: ['61'] },
  { obj: 'Contratação de serviço de hospedagem em nuvem (cloud computing) e backup', label: 'Cloud', expected: ['62', '63'] },

  // ═══ SAÚDE ═══
  { obj: 'CONTRATACAO DE EMPRESA PARA REALIZACAO DE LAUDOS ELETROCARDIOGRAMA', label: 'Laudos ECG', expected: ['86'] },
  { obj: 'Credenciamento de pessoas jurídicas na área médica para prestação de serviços de saúde', label: 'Credenciamento saúde', expected: ['86'] },
  { obj: 'Aquisição de 2 veículos Ambulância Tipo A para transporte de pacientes', label: 'Ambulância', expected: ['29', '45', '86'] },
  { obj: 'Aquisição de medicamentos da rede comercial destinados à Farmácia Básica Municipal', label: 'Medicamentos', expected: ['21', '46', '47'] },
  { obj: 'Contratação de empresa para serviços de exames de imagem incluindo tomografia e ressonância magnética', label: 'Exames imagem', expected: ['86'] },
  { obj: 'Aquisição de material médico-hospitalar para atendimento nas unidades de saúde do município', label: 'Material hospitalar', expected: ['21', '32', '86'] },
  { obj: 'Contratação de serviços de fisioterapia e reabilitação para pacientes do SUS', label: 'Fisioterapia', expected: ['86'] },
  { obj: 'Aquisição de equipamentos odontológicos para consultório da UBS Central', label: 'Odontologia', expected: ['32', '86'] },
  { obj: 'Contratação de empresa para cirurgia oftalmológica de catarata para pacientes do município', label: 'Cirurgia', expected: ['86'] },

  // ═══ SEGURANÇA ═══
  { obj: 'Contratação de pessoa jurídica para fornecimento de equipamentos de monitoramento sistema de alarme instalação e manutenção', label: 'Alarme/monit.', expected: ['80', '43'] },
  { obj: 'Aquisição de Carga e Recarga de Extintores de Incêndio e aparelhos de sinalização de segurança', label: 'Extintores', expected: ['80', '84'] },
  { obj: 'Contratação de empresa de vigilância armada e desarmada para órgãos municipais', label: 'Vigilância', expected: ['80'] },
  { obj: 'Contratação de empresa para serviço de monitoramento eletrônico por CFTV', label: 'CFTV', expected: ['80'] },

  // ═══ LIMPEZA & FACILITIES ═══
  { obj: 'Serviços de limpeza conservação e jardinagem predial', label: 'Limpeza', expected: ['81'] },
  { obj: 'Manutenção preventiva e corretiva de ar condicionado', label: 'Ar condicionado', expected: ['43', '33'] },
  { obj: 'Contratação de empresa para serviços de dedetização desratização e desinsetização em prédios públicos', label: 'Dedetização', expected: ['81'] },
  { obj: 'Contratação de empresa para serviços de poda de árvores e manutenção de áreas verdes', label: 'Jardinagem', expected: ['81'] },
  { obj: 'Contratação de serviços de copeiragem para fornecimento de café e limpeza de copas', label: 'Copeiragem', expected: ['81'] },

  // ═══ ALIMENTAÇÃO ═══
  { obj: 'Fornecimento de refeições transportadas para alimentação escolar', label: 'Merenda escolar', expected: ['56'] },
  { obj: 'Aquisição de gêneros alimentícios para composição de cestas básicas', label: 'Cestas básicas', expected: ['10', '46', '47'] },
  { obj: 'Contratação de empresa para fornecimento de coffee break para eventos institucionais', label: 'Coffee break', expected: ['56'] },
  { obj: 'Contratação de serviço de buffet para eventos oficiais do município', label: 'Buffet', expected: ['56'] },

  // ═══ TRANSPORTE ═══
  { obj: 'CONTRATAÇÃO DE EMPRESA PARA PRESTAÇÃO DE SERVIÇOS DE TRANSPORTE ESCOLAR', label: 'Transporte escolar', expected: ['49'] },
  { obj: 'CONTRATAÇÃO DE PRESTADOR DE SERVIÇO PARA COLETA TRANSPORTE E DISTRIBUIÇÃO DE ÁGUA POTÁVEL OPERAÇÃO CARRO PIPA', label: 'Carro pipa', expected: ['49', '36'] },
  { obj: 'Contratação de empresa para serviço de frete e transporte de cargas para o município', label: 'Frete', expected: ['49'] },
  { obj: 'Locação de veículos com motorista para atendimento das secretarias municipais', label: 'Locação veíc.', expected: ['49', '77'] },

  // ═══ VEÍCULOS ═══
  { obj: 'Aquisição de veículo automotor tipo passeio', label: 'Veículo passeio', expected: ['29', '45'] },
  { obj: 'Contratação de seguro para a frota de veículos do município', label: 'Seguro frota', expected: ['65'] },
  { obj: 'Aquisição de combustível para abastecimento de veículos', label: 'Combustível', expected: ['47'] },
  { obj: 'Aquisição de peças e acessórios para manutenção da frota de veículos municipais', label: 'Peças veículos', expected: ['45'] },
  { obj: 'Contratação de serviço de manutenção preventiva e corretiva de veículos leves e pesados', label: 'Manutenção veíc.', expected: ['45'] },

  // ═══ EDUCAÇÃO ═══
  { obj: 'Solução educacional em Educação Étnico-Racial e Cultura Afro-Brasileira destinada aos alunos', label: 'Educação étnica', expected: ['85'] },
  { obj: 'Curso de Capacitação de Dirigentes da Unidade Gestora', label: 'Capacitação', expected: ['85'] },
  { obj: 'CONTRATAÇÃO DE EMPRESA PARA TREINAMENTO CURSO ON-LINE DE FORMAÇÃO EM LICITAÇÕES E CONTRATOS', label: 'Curso online', expected: ['85'] },
  { obj: 'Aquisição de material didático e livros para bibliotecas das escolas municipais', label: 'Material didático', expected: ['85', '18'] },
  { obj: 'Contratação de professor de inglês para ministrar aulas no ensino fundamental', label: 'Professor inglês', expected: ['85'] },
  { obj: 'Contratação de empresa para fornecimento de mobiliário escolar incluindo carteiras e quadros', label: 'Mobiliário escolar', expected: ['31'] },

  // ═══ ARTES & CULTURA ═══
  { obj: 'CONTRATAÇÃO DO CANTOR CAIO LIVIO PARA APRESENTAÇÃO ARTÍSTICA DURANTE O CARNAVAL 2026', label: 'Show carnaval', expected: ['90', '93'] },
  { obj: 'CONTRATAÇÃO DE EMPRESA PARA SHOW ARTÍSTICO COM A DUPLA BRUNO E BARRETTO NA FESTA DO PEÃO', label: 'Show dupla', expected: ['90', '93'] },
  { obj: 'Contratação de serviço de sonorização iluminação e palco para eventos municipais', label: 'Sonorização', expected: ['90', '82'] },
  { obj: 'Contratação de grupo teatral para apresentações nas escolas da rede municipal', label: 'Teatro', expected: ['90'] },

  // ═══ ESPORTES ═══
  { obj: 'CONTRATAÇÃO DE SERVIÇOS DE ARBITRAGEM ESPORTIVA PARA FUTSAL FUTEBOL BOCHA E VÔLEI', label: 'Arbitragem', expected: ['93'] },
  { obj: 'Aquisição de material esportivo para uso nas escolinhas de esporte do município', label: 'Material esport.', expected: ['93', '32'] },
  { obj: 'Construção de quadra poliesportiva coberta no bairro Jardim das Flores', label: 'Quadra esporte', expected: ['41', '42', '93'] },

  // ═══ CONSULTORIA & JURÍDICO ═══
  { obj: 'CONTRATAÇÃO DE CONSULTORIA EM ADMINISTRAÇÃO TRIBUTÁRIA PARA MEDIDAS JUDICIAIS', label: 'Consultoria tribut.', expected: ['69', '70'] },
  { obj: 'CONTRATAÇÃO DE ASSESSORIA OU CONSULTORIA JURÍDICA ESPECIALIZADA', label: 'Consultoria juríd.', expected: ['69', '70'] },
  { obj: 'Contratação de empresa de auditoria independente para análise das contas do município', label: 'Auditoria', expected: ['69'] },
  { obj: 'Contratação de serviços de contabilidade pública e prestação de contas', label: 'Contabilidade', expected: ['69'] },

  // ═══ ÁGUA & SANEAMENTO ═══
  { obj: 'CONTRATAÇÃO DE EMPRESA PARA FORNECIMENTO DE HIPOCLORITO DE SÓDIO PARA TRATAMENTO DE ÁGUA', label: 'Químico/Água', expected: ['20', '36'] },
  { obj: 'Contratação de empresa para perfuração de poço artesiano e instalação de bomba', label: 'Poço artesiano', expected: ['36', '42'] },
  { obj: 'Construção de rede coletora de esgoto e ligações domiciliares', label: 'Rede esgoto', expected: ['37', '42'] },
  { obj: 'Contratação de empresa para limpeza e manutenção de fossas sépticas', label: 'Fossas', expected: ['37'] },

  // ═══ VIAGENS & TURISMO ═══
  { obj: 'CONTRATAÇÃO DE EMPRESA PARA AGENCIAMENTO DE VIAGENS RESERVA EMISSÃO MARCAÇÃO DE BILHETES DE PASSAGENS', label: 'Agência viagens', expected: ['79'] },
  { obj: 'Aquisição de passagens aéreas para servidores municipais', label: 'Passagens aéreas', expected: ['51', '79'] },

  // ═══ ENERGIA ═══
  { obj: 'ILUMINAÇÃO PÚBLICA ENERGIA DE GOIÁS MANUTENÇÃO', label: 'Iluminação públ.', expected: ['35'] },
  { obj: 'Contratação de empresa para instalação de sistema de energia solar fotovoltaica', label: 'Energia solar', expected: ['35'] },
  { obj: 'Contratação de empresa para manutenção da rede de iluminação pública do município', label: 'Manut. iluminação', expected: ['35'] },

  // ═══ TELECOMUNICAÇÕES ═══
  { obj: 'Contratação de empresa para fornecimento de serviço de telefonia fixa e móvel', label: 'Telefonia', expected: ['61'] },
  { obj: 'Contratação de provedor de internet banda larga para unidades de saúde', label: 'Internet banda larga', expected: ['61'] },

  // ═══ LAVANDERIA & SERVIÇOS PESSOAIS ═══
  { obj: 'Processamento de roupas de serviço de saúde com locação de enxoval hospitalar', label: 'Lavanderia hosp.', expected: ['96'] },
  { obj: 'Contratação de serviço de lavanderia industrial para lavagem de uniformes', label: 'Lavanderia indust.', expected: ['96'] },

  // ═══ MÓVEIS ═══
  { obj: 'Aquisição de divisórias modulares do tipo Naval e PVC e portas de divisória', label: 'Divisórias', expected: ['31', '43'] },
  { obj: 'Aquisição de mobiliário de escritório incluindo mesas cadeiras e armários', label: 'Mobiliário escrit.', expected: ['31'] },
  { obj: 'Aquisição de estantes de aço para arquivo do setor administrativo', label: 'Estantes aço', expected: ['31'] },

  // ═══ PUBLICIDADE & COMUNICAÇÃO ═══
  { obj: 'Contratação de agência de publicidade para campanha institucional do município', label: 'Publicidade', expected: ['73'] },
  { obj: 'Contratação de empresa para serviços de design gráfico e produção visual', label: 'Design gráfico', expected: ['73', '74'] },
  { obj: 'Contratação de serviços de impressão gráfica de materiais informativos', label: 'Impressão', expected: ['18'] },

  // ═══ RESÍDUOS & MEIO AMBIENTE ═══
  { obj: 'Contratação de empresa para coleta e transporte de resíduos sólidos urbanos', label: 'Coleta lixo', expected: ['38'] },
  { obj: 'Contratação de empresa para operação do aterro sanitário municipal', label: 'Aterro', expected: ['38'] },
  { obj: 'Elaboração de estudo de impacto ambiental e relatório RIMA para obras de infraestrutura', label: 'Estudo ambiental', expected: ['71', '74'] },

  // ═══ MÃO DE OBRA & RH ═══
  { obj: 'Contratação de empresa para fornecimento de mão de obra terceirizada de auxiliar administrativo e recepcionista', label: 'Mão de obra', expected: ['78'] },
  { obj: 'Contratação de empresa de recursos humanos para recrutamento e seleção de pessoal', label: 'RH', expected: ['78'] },

  // ═══ LOCAÇÃO & ALUGUEL ═══
  { obj: 'Locação de máquinas pesadas retroescavadeira e pá carregadeira', label: 'Locação máquinas', expected: ['77', '28'] },
  { obj: 'Locação de imóvel para instalação de secretaria municipal de saúde', label: 'Locação imóvel', expected: ['68'] },

  // ═══ UNIFORMES & VESTUÁRIO ═══
  { obj: 'Aquisição de uniformes e EPIs para servidores da secretaria de obras', label: 'Uniformes/EPI', expected: ['14'] },
  { obj: 'Confecção de fardamento escolar para alunos da rede municipal de ensino', label: 'Fardamento', expected: ['14'] },

  // ═══ SEGUROS ═══
  { obj: 'Contratação de seguro de vida em grupo para servidores públicos municipais', label: 'Seguro vida', expected: ['65'] },
  { obj: 'Contratação de empresa de corretagem de seguros para gestão da apólice patrimonial', label: 'Corretagem seguro', expected: ['65', '66'] },

  // ═══ ESCRITÓRIO & ADMIN ═══
  { obj: 'Contratação de empresa para serviços de organização de eventos e congressos', label: 'Organiz. eventos', expected: ['82'] },
  { obj: 'Contratação de serviço de digitalização de documentos e gestão documental', label: 'Digitalização', expected: ['82'] },

  // ═══ QUÍMICOS & PRODUTOS INDUSTRIAIS ═══
  { obj: 'Aquisição de produtos químicos para tratamento de piscinas públicas', label: 'Produtos químicos', expected: ['20'] },
  { obj: 'Aquisição de material de limpeza e produtos de higienização', label: 'Material limpeza', expected: ['20', '46', '47'] },

  // ═══ GRÁFICA & IMPRESSÃO ═══
  { obj: 'Serviço de impressão de carnês de IPTU e documentos de arrecadação', label: 'Impressão carnês', expected: ['18'] },
  { obj: 'Confecção de placas de sinalização viária e indicativa', label: 'Placas sinaliz.', expected: ['25', '42'] },

  // ═══ IMOBILIÁRIO ═══
  { obj: 'Contratação de empresa para avaliação de imóveis para fins de desapropriação', label: 'Avaliação imóveis', expected: ['68', '71'] },

  // ═══ ASSISTÊNCIA SOCIAL ═══
  { obj: 'Contratação de serviços para manutenção e operação de creches municipais', label: 'Creches', expected: ['85', '88'] },
  { obj: 'Contratação de serviço de acolhimento institucional para idosos em situação de vulnerabilidade', label: 'Acolhimento idosos', expected: ['87'] },

  // ═══ FINANCEIRO ═══
  { obj: 'Contratação de instituição financeira para gestão da folha de pagamento dos servidores', label: 'Banco folha', expected: ['64'] },

  // ═══ VETERINÁRIA ═══
  { obj: 'Contratação de clínica veterinária para atendimento de animais do centro de zoonoses', label: 'Veterinária', expected: ['75'] },

  // ═══ CORREIOS & ENTREGA ═══
  { obj: 'Contratação de empresa para serviço de malote e entrega de correspondências oficiais', label: 'Malote', expected: ['53'] },

  // ═══ EDGE CASES — textos muito curtos ═══
  { obj: 'Locação de veículos', label: 'Curto: veículos', expected: ['77', '45'] },
  { obj: 'Material de construção', label: 'Curto: construção', expected: ['47', '23'] },
  { obj: 'Serviço de vigilância', label: 'Curto: vigilância', expected: ['80'] },
  { obj: 'Equipamentos hospitalares', label: 'Curto: hospitalar', expected: ['32', '86'] },
]

// ── Run tests ──
console.log(`=== Teste CNAE Classificador v3 — ${tests.length} tenders ===\n`)

let highConf = 0, lowConf = 0, correct = 0, partial = 0, wrong = 0, noResult = 0
const failures: Array<{ label: string; obj: string; got: string[]; expected: string[]; details: string }> = []

for (const test of tests) {
  const r = classifyLocal(test.obj)
  if (r.confidence === 'high') highConf++; else lowConf++

  const hasOverlap = r.divisions.some((d) => test.expected.includes(d))
  const allCorrect = r.divisions.length > 0 && r.divisions.every((d) => test.expected.includes(d))
  let st: string
  if (r.divisions.length === 0) { st = '⬜'; noResult++ }
  else if (allCorrect) { st = '✅'; correct++ }
  else if (hasOverlap) { st = '🟡'; partial++ }
  else { st = '❌'; wrong++ }

  const divStr = r.details.map((x) => `${x.div}(${x.score})`).join(',') || '-'
  const conf = r.confidence === 'high' ? 'H' : 'L'
  console.log(`${st} [${conf}] ${divStr.padEnd(40)} exp=${test.expected.join(',')}  ${test.label}`)

  if (st === '❌' || st === '⬜') {
    const detailStr = r.details.map(d => `${d.div}: ${d.details.join(', ')}`).join(' | ')
    failures.push({ label: test.label, obj: test.obj.substring(0, 80), got: r.divisions, expected: test.expected, details: detailStr })
  }
}

console.log(`\n${'═'.repeat(60)}`)
console.log(`RESUMO (${tests.length} tenders)`)
console.log(`${'═'.repeat(60)}`)
console.log(`✅ Correto:     ${correct}/${tests.length} (${Math.round(correct/tests.length*100)}%)`)
console.log(`🟡 Parcial:     ${partial}/${tests.length} (${Math.round(partial/tests.length*100)}%)`)
console.log(`❌ Errado:      ${wrong}/${tests.length} (${Math.round(wrong/tests.length*100)}%)`)
console.log(`⬜ Sem result:  ${noResult}/${tests.length} (${Math.round(noResult/tests.length*100)}%)`)
console.log(``)
console.log(`HIGH conf (sem IA): ${highConf}/${tests.length} (${Math.round(highConf/tests.length*100)}%)`)
console.log(`LOW conf  (→ IA):   ${lowConf}/${tests.length} (${Math.round(lowConf/tests.length*100)}%)`)
console.log(``)
const classified = tests.length - noResult
console.log(`Precisão (qdo classifica): ${classified > 0 ? Math.round((correct+partial)/classified*100) : 0}%`)
console.log(`Cobertura: ${Math.round(classified/tests.length*100)}%`)
console.log(`Economia IA: ${Math.round(highConf/tests.length*100)}%`)

if (failures.length > 0) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`FALHAS E GAPS (${failures.length}):`)
  console.log(`${'─'.repeat(60)}`)
  for (const f of failures) {
    console.log(`\n  ${f.label}`)
    console.log(`  Obj: "${f.obj}..."`)
    console.log(`  Got: [${f.got.join(',')}] Expected: [${f.expected.join(',')}]`)
    if (f.details) console.log(`  Matches: ${f.details}`)
  }
}
