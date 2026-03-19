/**
 * CNAE Group Descriptions — Single Source of Truth
 *
 * Maps 2-digit CNAE division codes to human-readable descriptions of the
 * economic activities they cover. Used across the platform for:
 *   - AI triage prompts (company context building)
 *   - Match analysis (company profile enrichment)
 *   - Profile generation (CNAE description lookup)
 *
 * IMPORTANT: This is the CANONICAL definition. Do NOT duplicate this constant
 * elsewhere. Import it from @licitagram/shared instead.
 */
export const CNAE_GROUPS: Record<string, string> = {
  '10': 'Alimentacao - fabricacao de produtos alimenticios',
  '26': 'Fabricacao de equipamentos de informatica e eletronicos',
  '32': 'Fabricacao de produtos diversos, instrumentos medicos',
  '33': 'Manutencao e reparacao de maquinas e equipamentos',
  '35': 'Eletricidade, gas e outras utilidades',
  '41': 'Construcao de edificios',
  '42': 'Obras de infraestrutura',
  '43': 'Servicos especializados para construcao',
  '46': 'Comercio atacadista de equipamentos, maquinas, materiais',
  '47': 'Comercio varejista',
  '49': 'Transporte terrestre, logistica',
  '52': 'Armazenamento e atividades auxiliares de transporte',
  '56': 'Alimentacao - servicos de alimentacao, restaurantes, catering',
  '61': 'Telecomunicacoes, telefonia, internet',
  '62': 'Tecnologia da Informacao - desenvolvimento de software, consultoria em TI, suporte tecnico, processamento de dados',
  '63': 'Servicos de informacao - portais, provedores de conteudo, processamento de dados',
  '68': 'Atividades imobiliarias',
  '69': 'Atividades juridicas, contabilidade, auditoria',
  '70': 'Consultoria em gestao empresarial, assessoria, planejamento estrategico',
  '71': 'Servicos de engenharia, arquitetura, testes e analises tecnicas',
  '72': 'Pesquisa e desenvolvimento',
  '73': 'Publicidade, pesquisa de mercado, design',
  '77': 'Aluguel de maquinas e equipamentos, objetos pessoais e domesticos',
  '80': 'Vigilancia e seguranca',
  '81': 'Limpeza, conservacao, manutencao predial, facilities',
  '82': 'Servicos administrativos, de escritorio e apoio empresarial',
  '85': 'Educacao, treinamento, capacitacao',
  '86': 'Saude - atividades de atencao a saude humana',
  '95': 'Reparacao e manutencao de equipamentos de informatica',
}
