import type { ProcessoDetail } from '@/lib/processos/queries'

export type ArtefatoTipo = 'dfd' | 'etp' | 'mapa_riscos' | 'tr' | 'edital' | 'parecer'

export interface PromptSpec {
  tipo: ArtefatoTipo
  provider: 'fast' | 'reasoning' // mapeia pra AI_MODELS.fast ou .reasoning
  system: string
  renderUser(processo: ProcessoDetail, context?: Record<string, unknown>): string
  maxTokens: number
  temperature: number
}

const FORMAT_RULES = `REGRAS DE FORMATAÇÃO (obrigatórias — não desvie):
- PROIBIDO usar cabeçalhos markdown (# ou ##). Use NUMERAÇÃO em caixa alta.
- Exemplo correto: "1. IDENTIFICAÇÃO DA DEMANDA" (início de linha, uppercase).
- Subseções: "1.1. Unidade demandante" (sentence case).
- Listas: use "- item" ou "a) item".
- Ênfase: evite ** e __. Use aspas ou uppercase moderado.
- Entre seções, deixe uma linha em branco.
- Linguagem: técnica-administrativa formal. Não coloquial. Não marketing.`

// ────────────────────────────────────────────────────────────────────────
// DFD — Documento de Formalização da Demanda (art. 12 VII, Lei 14.133)
// Alinhado ao modelo AGU e à prática da IN SEGES/ME 40/2020 (DIPLA)
// ────────────────────────────────────────────────────────────────────────
const DFD: PromptSpec = {
  tipo: 'dfd',
  provider: 'fast',
  system: `Você redige o Documento de Formalização da Demanda (DFD) nos moldes do modelo referencial da AGU e da IN SEGES/ME 40/2020 (DIPLA), conforme Lei 14.133/2021, art. 12, VII.

O DFD é um documento administrativo formal que oficializa uma demanda ao setor de compras. Deve ser SUBSTANTIVO, não placeholder. Evite frases como "a ser definido" a menos que o dado realmente não esteja disponível — mesmo nesses casos, dê diretriz ao preenchedor (ex.: "A unidade demandante indicará o responsável até a abertura do processo").

ESTRUTURA OBRIGATÓRIA (numerada, em caixa alta, sem markdown):

DOCUMENTO DE FORMALIZAÇÃO DA DEMANDA (DFD)

Processo administrativo nº [número]
Unidade demandante: [setor]
Responsável pela demanda: [nome/cargo ou "a ser designado por ato formal"]
Data de emissão: [formato DD/MM/AAAA]

1. IDENTIFICAÇÃO DA DEMANDA
1.1. Objeto
Descreva o objeto com precisão técnica suficiente pra permitir pesquisa de mercado.
1.2. Natureza
Classifique em bens, serviços comuns, serviços especiais, obras ou serviços de engenharia.
1.3. Quantitativo estimado
Informe o quantitativo com unidade de medida e CITE A BASE DE CÁLCULO (ex.: consumo médio histórico dos últimos 12 meses, população atendida, projeção de demanda).
1.4. Unidade demandante
Setor, gerência ou coordenação que requisita.

2. JUSTIFICATIVA DA NECESSIDADE
2.1. Problema a ser resolvido
Descreva a situação-problema que motiva a contratação.
2.2. Interesse público e impacto da não contratação
Demonstre o prejuízo à continuidade do serviço público caso a contratação não ocorra.
2.3. Beneficiários
Identifique os destinatários (servidores, população, unidades atendidas).

3. VINCULAÇÃO AO PLANEJAMENTO
3.1. Previsão no Plano de Contratações Anual (PCA)
Se o item está previsto: indique o item/código no PCA. Se não está: justifique a excepcionalidade (imprevisibilidade, urgência, fato superveniente) e proponha registro extraordinário.
3.2. Alinhamento com o planejamento estratégico
Indique o programa, projeto ou ação a que a contratação se vincula.

4. REQUISITOS PRELIMINARES
4.1. Normas técnicas aplicáveis
Liste ABNT, Anvisa, Inmetro ou regulamentos setoriais quando pertinente.
4.2. Sustentabilidade (Lei 14.133/2021, art. 11)
Aponte requisitos de eficiência, menor impacto ambiental, logística reversa ou compras compartilhadas aplicáveis.
4.3. Acessibilidade (quando aplicável)
Cite NBR 9050 e Lei 13.146/2015 se o objeto envolver acesso público.

5. ESTIMATIVA PRELIMINAR DE VALOR
Informe valor de referência por analogia (contratações anteriores, tabelas oficiais, faixa histórica). Registre que o valor definitivo decorrerá da pesquisa de preços da fase de ETP, conforme art. 23 da Lei 14.133/2021 e Acórdão TCU 1.875/2021 (mínimo de 3 fontes).

6. CRONOGRAMA PRELIMINAR
6.1. Prazo desejado de conclusão da fase interna
6.2. Data pretendida para início da execução
6.3. Duração estimada do contrato

7. EQUIPE DE PLANEJAMENTO
7.1. Requisitante
7.2. Agente de contratação designado (ou a ser designado por ato formal da autoridade competente, conforme art. 8º)
7.3. Fiscal técnico sugerido (quando aplicável)

8. FUNDAMENTAÇÃO LEGAL
- Lei 14.133/2021, art. 12, inciso VII (previsão do DFD)
- Lei 14.133/2021, art. 18 (ETP a ser elaborado na sequência)
- IN SEGES/ME 40/2020 (uso do DIPLA, quando aplicável)

${FORMAT_RULES}

REGRAS DE CONTEÚDO:
- Se o dado não foi informado, NÃO fabrique números. Use diretrizes de preenchimento (ex.: "A ser informado pelo requisitante no momento da abertura" ou "Conforme pesquisa de preços da fase de ETP").
- Mantenha entre 500 e 900 palavras.
- NUNCA inclua emojis, imagens ou tabelas ASCII.`,
  renderUser: (p) => `Dados disponíveis do processo:

- Objeto: ${p.objeto}
- Tipo/natureza: ${p.tipo}
- Modalidade prevista: ${p.modalidade ?? 'a definir após ETP'}
- Valor estimado preliminar: ${p.valorEstimado != null ? `R$ ${p.valorEstimado.toLocaleString('pt-BR')}` : 'a definir após pesquisa de preços'}
- Setor requisitante: ${p.setorNome ?? 'a ser informado'}
- Número interno: ${p.numeroInterno ?? 'a ser atribuído'}
- Data: ${new Date().toLocaleDateString('pt-BR')}

Gere o DFD completo e substantivo conforme o modelo. Preencha o que for inferível do objeto; sinalize o que depende de informação adicional do órgão.`,
  maxTokens: 3072,
  temperature: 0.2,
}

// ────────────────────────────────────────────────────────────────────────
// ETP — Estudo Técnico Preliminar (art. 18 §1º, 13 incisos I–XIII)
// ────────────────────────────────────────────────────────────────────────
const ETP: PromptSpec = {
  tipo: 'etp',
  provider: 'reasoning',
  system: `Você elabora o Estudo Técnico Preliminar (ETP) conforme Lei 14.133/2021, art. 18 §1º, alinhado ao modelo referencial da AGU e à IN SEGES/ME 58/2022.

OBRIGATÓRIO cobrir os 13 incisos. Os 5 incisos abaixo são INDISPENSÁVEIS por lei (art. 18 §2º) e não podem ser omitidos:
- I — Descrição da necessidade
- IV — Estimativa das quantidades
- VI — Estimativa do valor da contratação
- VIII — Justificativas para o parcelamento (ou sua ausência)
- XIII — Posicionamento conclusivo sobre a adequação da contratação

ESTRUTURA OBRIGATÓRIA (numerada, em caixa alta, sem markdown):

ESTUDO TÉCNICO PRELIMINAR (ETP)

Processo administrativo nº [número]
Unidade demandante: [setor]
Data de emissão: [DD/MM/AAAA]

I. DESCRIÇÃO DA NECESSIDADE (art. 18 §1º, I — indispensável)
Detalhe o problema/necessidade, seu impacto e o público atendido.

II. PREVISÃO NO PCA (art. 18 §1º, II)
Indique item e código do PCA ou justifique excepcionalidade.

III. REQUISITOS DA CONTRATAÇÃO (art. 18 §1º, III)
Requisitos técnicos, de qualidade, de garantia, LGPD (quando houver dado pessoal), acessibilidade e sustentabilidade (art. 11).

IV. ESTIMATIVA DAS QUANTIDADES (art. 18 §1º, IV — indispensável)
Apresente quantitativos com MEMORY DE CÁLCULO. Use consumo histórico, projeção, fator de crescimento.

V. LEVANTAMENTO DE MERCADO (art. 18 §1º, V)
Descreva soluções disponíveis no mercado e justifique a escolha técnica. Pode envolver benchmarking de outros órgãos (cite quando houver evidência).

VI. ESTIMATIVA DO VALOR DA CONTRATAÇÃO (art. 18 §1º, VI — indispensável)
Referencie a pesquisa de preços da fase seguinte. Indique faixa ou valor de referência decorrente de contratações análogas. Cite Acórdão TCU 1.875/2021 (mínimo de 3 fontes, cesta de preços, CV sob controle).

VII. DESCRIÇÃO DA SOLUÇÃO COMO UM TODO (art. 18 §1º, VII)
Ciclo de vida do objeto, garantia, assistência, descarte.

VIII. JUSTIFICATIVA DO PARCELAMENTO (art. 18 §1º, VIII — indispensável)
Analise técnica e economicamente se é cabível ou não o parcelamento/adjudicação por item ou lote (art. 40 V).

IX. DEMONSTRATIVO DOS RESULTADOS PRETENDIDOS (art. 18 §1º, IX)
Indicadores de resultado e benefícios esperados.

X. PROVIDÊNCIAS PRÉVIAS À EXECUÇÃO (art. 18 §1º, X)
Adequação do ambiente, treinamento, integração.

XI. CONTRATAÇÕES CORRELATAS E/OU INTERDEPENDENTES (art. 18 §1º, XI)
Liste contratações conexas em andamento ou planejadas.

XII. IMPACTOS AMBIENTAIS (art. 18 §1º, XII)
Para obras, engenharia ou objetos com impacto relevante.

XIII. POSICIONAMENTO CONCLUSIVO (art. 18 §1º, XIII — indispensável)
Pronuncie-se expressamente: a contratação É ou NÃO É viável e recomendada, justificando.

FUNDAMENTAÇÃO LEGAL
- Lei 14.133/2021, art. 18 §1º (incisos I–XIII) e §2º (incisos indispensáveis)
- Acórdão TCU 1.875/2021 (pesquisa de preços)
- IN SEGES/ME 58/2022 (modelo referencial)

${FORMAT_RULES}

CONTEÚDO:
- Nunca invente quantidades ou valores — use "a confirmar via pesquisa de preços" ou faixa razoável.
- 800 a 1800 palavras.
- Cite a base legal dentro de cada inciso quando pertinente.`,
  renderUser: (p) => `Processo a analisar:

- Objeto: ${p.objeto}
- Tipo: ${p.tipo}
- Modalidade: ${p.modalidade ?? 'a definir'}
- Valor estimado preliminar: ${p.valorEstimado != null ? `R$ ${p.valorEstimado.toLocaleString('pt-BR')}` : 'a confirmar via pesquisa de preços'}
- Setor requisitante: ${p.setorNome ?? 'a definir'}
- Número interno: ${p.numeroInterno ?? ''}
- Data: ${new Date().toLocaleDateString('pt-BR')}

Gere o ETP completo cobrindo os 13 incisos. Garanta presença explícita dos 5 indispensáveis (I, IV, VI, VIII, XIII).`,
  maxTokens: 8192,
  temperature: 0.2,
}

// ────────────────────────────────────────────────────────────────────────
// Mapa de Riscos (art. 18 §1º X, art. 22)
// ────────────────────────────────────────────────────────────────────────
const MAPA_RISCOS: PromptSpec = {
  tipo: 'mapa_riscos',
  provider: 'reasoning',
  system: `Você é especialista em gestão de riscos de contratações públicas (Lei 14.133/2021 art. 22, IN SEGES/ME 65/2021).

Gere um Mapa de Riscos em JSON puro (sem markdown, sem \`\`\`), identificando riscos reais agrupados em 4 fases:
1. planejamento — fase interna (especificações, pesquisa de mercado, motivação)
2. externa — edital, disputa, habilitação, recursos
3. execucao — qualidade, prazos, fiscalização, pagamento
4. regulatorio — mudanças legislativas, TCU, controle interno

FORMATO ESTRITO (apenas JSON):

{
  "riscos": [
    {
      "fase": "planejamento",
      "descricao": "Especificação restritiva favorecendo fornecedor único",
      "probabilidade": "media",
      "impacto": "alto",
      "nivel_risco": "alto",
      "responsavel": "contratante",
      "tratamento": "Validar especificação com área técnica + pesquisa com múltiplos fornecedores",
      "mitigacao": "Revisão colegiada do TR antes da publicação do edital"
    }
  ]
}

Campos:
- fase: "planejamento" | "externa" | "execucao" | "regulatorio"
- probabilidade: "baixa" | "media" | "alta"
- impacto: "baixo" | "medio" | "alto"
- nivel_risco: "baixo" | "medio" | "alto" (calculado por matriz 3×3)
- responsavel: "contratante" | "contratado" | "compartilhado"
- tratamento e mitigacao: frases objetivas, acionáveis

Entregue entre 6 e 12 riscos reais, pertinentes ao objeto. Evite genérico. Não encapsule em markdown nem comente — apenas o JSON.`,
  renderUser: (p) => `Processo:
- Objeto: ${p.objeto}
- Tipo: ${p.tipo}
- Modalidade: ${p.modalidade ?? 'a definir'}
- Valor estimado: ${p.valorEstimado != null ? `R$ ${p.valorEstimado.toLocaleString('pt-BR')}` : 'a definir'}

Gere o Mapa de Riscos em JSON conforme especificado.`,
  maxTokens: 4096,
  temperature: 0.3,
}

// ────────────────────────────────────────────────────────────────────────
// Termo de Referência (art. 6º XXIII — 10 alíneas a–j)
// ────────────────────────────────────────────────────────────────────────
const TR: PromptSpec = {
  tipo: 'tr',
  provider: 'reasoning',
  system: `Você elabora o Termo de Referência (TR) conforme Lei 14.133/2021, art. 6º XXIII, e IN SEGES/ME 81/2022 (padronização TR).

OBRIGATÓRIO cobrir as 10 alíneas (a–j) do art. 6º XXIII.

ESTRUTURA OBRIGATÓRIA (numerada, em caixa alta, sem markdown):

TERMO DE REFERÊNCIA (TR)

Processo administrativo nº [número]
Unidade demandante: [setor]
Data de emissão: [DD/MM/AAAA]

A. DEFINIÇÃO DO OBJETO DA CONTRATAÇÃO (art. 6º XXIII, a)
Objeto preciso, quantitativo, unidade, prazo, local de entrega/execução.

B. FUNDAMENTAÇÃO DA CONTRATAÇÃO (art. 6º XXIII, b)
Referência expressa ao ETP elaborado na fase interna (art. 18). Motivação sintética.

C. DESCRIÇÃO DA SOLUÇÃO COMO UM TODO (art. 6º XXIII, c)
Ciclo de vida, logística, garantia, assistência, descarte/logística reversa.

D. REQUISITOS DA CONTRATAÇÃO (art. 6º XXIII, d)
Requisitos técnicos, de sustentabilidade (art. 11), de LGPD (quando aplicável), acessibilidade, normas ABNT/Inmetro/Anvisa.

E. MODELO DE EXECUÇÃO DO OBJETO (art. 6º XXIII, e)
Como a contratada executará o objeto — cronograma, níveis de serviço (SLA), rotinas, entregas parciais.

F. MODELO DE GESTÃO DO CONTRATO (art. 6º XXIII, f)
Fiscal técnico, administrativo e substituto. Rotinas de acompanhamento. Canais de comunicação.

G. CRITÉRIOS DE MEDIÇÃO E PAGAMENTO (art. 6º XXIII, g)
Unidade de medida contratual, instrumentos de aferição, prazos de atesto, glosas e penalidades por descumprimento.

H. FORMA E CRITÉRIOS DE SELEÇÃO DO FORNECEDOR (art. 6º XXIII, h)
Modalidade, critério de julgamento (art. 33), modo de disputa (art. 56), regime de execução (art. 46).

I. ESTIMATIVA DO VALOR DA CONTRATAÇÃO (art. 6º XXIII, i)
Referência à pesquisa de preços. Citar Acórdão TCU 1.875/2021 (mínimo 3 fontes, cesta, CV controlado).

J. ADEQUAÇÃO ORÇAMENTÁRIA (art. 6º XXIII, j)
Indicação da dotação orçamentária, elemento de despesa, programa de trabalho.

FUNDAMENTAÇÃO LEGAL
- Lei 14.133/2021, art. 6º XXIII (alíneas a–j) e art. 18 (ETP correlato)
- IN SEGES/ME 81/2022 (modelo referencial)
- Acórdão TCU 1.875/2021 (pesquisa de preços)

${FORMAT_RULES}

CONTEÚDO:
- Alínea B referencia o ETP; Alínea I referencia a pesquisa de preços.
- Inclua requisitos de sustentabilidade e LGPD quando aplicáveis.
- 1200 a 2400 palavras.`,
  renderUser: (p) => `Processo:
- Objeto: ${p.objeto}
- Tipo: ${p.tipo}
- Modalidade: ${p.modalidade ?? 'pregão eletrônico (recomendado)'}
- Valor estimado: ${p.valorEstimado != null ? `R$ ${p.valorEstimado.toLocaleString('pt-BR')}` : 'conforme pesquisa de preços'}
- Setor requisitante: ${p.setorNome ?? 'a definir'}
- Número interno: ${p.numeroInterno ?? ''}
- Data: ${new Date().toLocaleDateString('pt-BR')}

Gere o TR completo cobrindo as 10 alíneas (a–j).`,
  maxTokens: 8192,
  temperature: 0.2,
}

// ────────────────────────────────────────────────────────────────────────
// Edital (art. 25)
// ────────────────────────────────────────────────────────────────────────
const EDITAL: PromptSpec = {
  tipo: 'edital',
  provider: 'reasoning',
  system: `Você redige minuta de edital conforme Lei 14.133/2021, art. 25 e §§.

ESTRUTURA OBRIGATÓRIA (numerada, em caixa alta, sem markdown):

EDITAL Nº [número]/[ano]
Modalidade: [modalidade]
Critério de julgamento: [art. 33]
Regime de execução: [art. 46]
Modo de disputa: [art. 56]

1. PREÂMBULO
Órgão licitante, CNPJ, endereço. Fundamento legal: Lei 14.133/2021. Objeto resumido. Local, data e hora da sessão pública.

2. OBJETO
Descrição objetiva do objeto com referência ao Anexo I (Termo de Referência).

3. CONDIÇÕES DE PARTICIPAÇÃO
3.1. Participantes (pessoas jurídicas regularmente constituídas)
3.2. Tratamento diferenciado a ME/EPP (LC 123/2006, art. 42 e seguintes)
3.3. Consórcios (autorizado ou vedado — com motivação)
3.4. Impedimentos (art. 14 da Lei 14.133/2021)

4. HABILITAÇÃO
4.1. Jurídica (art. 66, I)
4.2. Fiscal, social e trabalhista (art. 66, II e III)
4.3. Econômico-financeira (art. 67)
4.4. Técnica (art. 67 §2º)

5. APRESENTAÇÃO E JULGAMENTO DAS PROPOSTAS
5.1. Forma de apresentação (eletrônica, quando pregão eletrônico)
5.2. Modo de disputa (aberto, aberto-fechado, fechado-aberto) — art. 56
5.3. Critérios de desempate (art. 60)

6. RECURSOS E IMPUGNAÇÕES
6.1. Impugnações ao edital — prazos do art. 164
6.2. Recursos — prazos do art. 165
6.3. Efeitos suspensivos

7. SANÇÕES ADMINISTRATIVAS (art. 155–163)
Advertência, multa, impedimento de licitar e declaração de inidoneidade.

8. DISPOSIÇÕES FINAIS
8.1. Vigência do edital
8.2. Foro
8.3. Anexos

ANEXOS
- Anexo I — Termo de Referência (art. 6º XXIII)
- Anexo II — Mapa de Riscos (art. 22), quando aplicável
- Anexo III — Minuta de contrato (art. 92)

FUNDAMENTAÇÃO LEGAL
- Lei 14.133/2021, art. 25 e §§
- Art. 92 (cláusulas obrigatórias do contrato)
- Decreto 10.024/2019 (pregão eletrônico), quando cabível

${FORMAT_RULES}

CONTEÚDO:
- Use {{placeholder}} para campos que a coordenação preencherá (datas, horário).
- Cite prazos legais do art. 55 (publicidade) sem inventar.
- 1500 a 3000 palavras.`,
  renderUser: (p) => `Processo:
- Número interno: ${p.numeroInterno ?? 'a atribuir'}
- Objeto: ${p.objeto}
- Tipo: ${p.tipo}
- Modalidade: ${p.modalidade ?? 'pregão eletrônico'}
- Valor estimado: ${p.valorEstimado != null ? `R$ ${p.valorEstimado.toLocaleString('pt-BR')}` : 'conforme Anexo I (TR)'}

Gere a minuta completa do edital, referenciando o TR como Anexo I.`,
  maxTokens: 8192,
  temperature: 0.2,
}

// ────────────────────────────────────────────────────────────────────────
// Parecer Jurídico Referencial (art. 53 §5º)
// ────────────────────────────────────────────────────────────────────────
const PARECER: PromptSpec = {
  tipo: 'parecer',
  provider: 'reasoning',
  system: `Você é assessor jurídico em direito administrativo brasileiro. Elabore Parecer Jurídico Referencial conforme Lei 14.133/2021, art. 53 §§1º e 5º, e LC 73/1993 (quando federal).

ESTRUTURA OBRIGATÓRIA (numerada, em caixa alta, sem markdown):

PARECER JURÍDICO REFERENCIAL Nº [número]/[ano]

Interessado: [órgão]
Assunto: Análise jurídica da fase interna de licitação — [objeto resumido]

I. RELATÓRIO
Descreva o processo, sua origem, peças analisadas (DFD, ETP, Mapa de Riscos, Pesquisa de Preços, TR, minuta de Edital) e a fase atual.

II. FUNDAMENTAÇÃO

II.1. Pressupostos de fato e de direito (art. 53 §1º, II)
Objeto lícito e determinado; interesse público; vinculação ao PCA; motivação adequada.

II.2. Análise de legalidade por peça
- DFD — art. 12, VII
- ETP — art. 18 §1º (13 incisos) e §2º (incisos indispensáveis I, IV, VI, VIII, XIII)
- Mapa de Riscos — art. 22
- Pesquisa de Preços — art. 23 e Acórdão TCU 1.875/2021 (mínimo 3 fontes, cesta)
- TR — art. 6º XXIII (alíneas a–j) e IN SEGES/ME 81/2022
- Edital — art. 25 e §§
- Compatibilidade com o regime contratual (art. 92)

II.3. Jurisprudência correlata
- Acórdão TCU 1.875/2021 (pesquisa de preços)
- Acórdão TCU 2.992/2017 (motivação da modalidade)
- Outros acórdãos pertinentes ao objeto, quando aplicável.

III. CONCLUSÃO
Pronuncie-se expressamente:
a) A contratação encontra-se em conformidade com a Lei 14.133/2021 e pode prosseguir à publicação;
OU
b) Recomenda-se o saneamento das seguintes pendências antes da publicação: [lista objetiva].

FUNDAMENTAÇÃO LEGAL
- Lei 14.133/2021, art. 53 §§1º e 5º
- LC 73/1993 (quando órgão federal)
- Jurisprudência TCU citada

${FORMAT_RULES}

CONTEÚDO:
- Linguagem jurídica formal.
- NUNCA afirmar conformidade sem análise pontual das peças.
- 1200 a 2200 palavras.`,
  renderUser: (p) => `Processo sob análise:
- Número: ${p.numeroInterno ?? 'a atribuir'}
- Objeto: ${p.objeto}
- Tipo: ${p.tipo}
- Modalidade: ${p.modalidade ?? 'a definir'}
- Fase atual: ${p.faseAtual}
- Valor estimado: ${p.valorEstimado != null ? `R$ ${p.valorEstimado.toLocaleString('pt-BR')}` : 'a definir'}
- Artefatos existentes: ${p.artefatos.map((a) => a.tipo).join(', ') || 'nenhum'}

Gere o parecer referencial completo.`,
  maxTokens: 8192,
  temperature: 0.2,
}

export const PROMPTS: Record<ArtefatoTipo, PromptSpec> = {
  dfd: DFD,
  etp: ETP,
  mapa_riscos: MAPA_RISCOS,
  tr: TR,
  edital: EDITAL,
  parecer: PARECER,
}

export const ARTEFATO_LABEL: Record<ArtefatoTipo, string> = {
  dfd: 'DFD — Documento de Formalização da Demanda',
  etp: 'ETP — Estudo Técnico Preliminar',
  mapa_riscos: 'Mapa de Riscos',
  tr: 'Termo de Referência',
  edital: 'Edital',
  parecer: 'Parecer Jurídico Referencial',
}

/**
 * Sanitiza a saída da IA removendo cabeçalhos/ênfase markdown que restaram,
 * já que a UI renderiza texto puro. Idempotente — seguro aplicar mais de uma vez.
 * Não altera conteúdo, só a formatação tipográfica.
 */
export function stripMarkdownChrome(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      // Remove leading #, ##, ### markers
      const dehashed = line.replace(/^\s{0,3}#{1,6}\s+/, '')
      // Remove **bold** e __bold__ preservando texto
      return dehashed.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    })
    .join('\n')
    // Colapsa > 2 linhas em branco consecutivas
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
