/**
 * Textos das declarações obrigatórias para propostas comerciais.
 *
 * Fundamentação legal:
 * - Lei nº 14.133/2021 (Nova Lei de Licitações e Contratos Administrativos)
 * - Lei Complementar nº 123/2006, art. 3º (ME/EPP)
 * - Constituição Federal, art. 7º, XXXIII (vedação ao trabalho de menores)
 * - Decreto nº 10.024/2019, art. 35 (pregão eletrônico)
 * - Modelos da AGU/CGU — Câmara Nacional de Modelos de Licitações e Contratos (CNMLC)
 *
 * Referências:
 * - AGU: https://www.gov.br/agu/pt-br/composicao/cgu/cgu/modelos/licitacoesecontratos/14133
 * - Lei 14.133: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm
 *
 * IMPORTANTE: Cada declaração é uma cláusula SEPARADA e NUMERADA.
 * Pregoeiros conferem item a item. Não misturar declarações.
 */

export const DECLARATION_TEXTS: Record<string, string> = {
  /**
   * 1. Declaração de exequibilidade de preços.
   * Fundamentação: Lei 14.133/2021, art. 59, §4º
   */
  exequibilidade:
    'Declaramos, sob as penas da lei, que os preços propostos são exequíveis e foram elaborados de forma independente, contemplando todos os custos diretos e indiretos necessários à plena execução do objeto, nos termos do art. 59 da Lei nº 14.133/2021.',

  /**
   * 2. Declaração de inclusão de tributos e encargos nos preços.
   * Fundamentação: Lei 14.133/2021, art. 63
   */
  tributos_inclusos:
    'Nos preços propostos estão incluídos todos os custos operacionais, encargos previdenciários, trabalhistas, tributários, comerciais e quaisquer outros que incidam direta ou indiretamente na execução do objeto, não cabendo à Contratante nenhum custo adicional.',

  /**
   * 3. Declaração de custos trabalhistas — OBRIGATÓRIA (art. 63, §1º).
   * Fundamentação: Lei 14.133/2021, art. 63, §1º — sob pena de desclassificação.
   * ESTA DECLARAÇÃO É SEPARADA E EXPLÍCITA conforme exigência legal.
   */
  custos_trabalhistas:
    'Declaramos que a proposta econômica compreende a integralidade dos custos para atendimento dos direitos trabalhistas assegurados na Constituição Federal, nas leis trabalhistas, nas normas infralegais, nas convenções coletivas de trabalho e nos termos de ajustamento de conduta vigentes na data de entrega desta proposta, conforme §1º do art. 63 da Lei nº 14.133/2021.',

  /**
   * 4. Declaração de conhecimento e concordância com o edital.
   * Fundamentação: Lei 14.133/2021, art. 12, I a IV
   */
  conhecimento_edital:
    'Declaramos que examinamos, conhecemos e nos submetemos integralmente às condições constantes do Edital e seus Anexos, inclusive quanto ao Termo de Referência e à Minuta do Contrato.',

  /**
   * 5. Declaração ME/EPP (condicional — só incluir se a empresa se enquadra).
   * Fundamentação: LC 123/2006, art. 3º; LC 147/2014; Lei 14.133/2021, art. 4º
   */
  me_epp:
    'Declaramos, sob as sanções administrativas cabíveis e sob as penas da lei, que esta empresa, na presente data, é considerada Microempresa/Empresa de Pequeno Porte, nos termos da Lei Complementar nº 123, de 14 de dezembro de 2006, alterada pela Lei Complementar nº 147, de 7 de agosto de 2014, e que não se enquadra em nenhuma das hipóteses de exclusão previstas no §4º do art. 3º da referida Lei Complementar, estando apta a usufruir do tratamento favorecido estabelecido nos arts. 42 a 49 da Lei Complementar nº 123/2006.',

  /**
   * 6. Declaração de cumprimento do art. 7º, XXXIII da CF (vedação menores).
   * Fundamentação: CF/88, art. 7º, XXXIII; Lei 14.133/2021, art. 68, VI
   */
  sem_vinculo:
    'Declaramos, para os devidos fins e sob as penas da lei, em cumprimento ao exigido no inciso XXXIII do art. 7º da Constituição Federal combinado com o inciso VI do art. 68 da Lei nº 14.133/2021, que não empregamos menores de dezoito anos em trabalho noturno, perigoso ou insalubre e que não empregamos menores de dezesseis anos em qualquer trabalho, salvo na condição de aprendiz, a partir dos quatorze anos.',

  /**
   * 7. Declaração de prazo de entrega/execução.
   * A maioria dos editais exige que a proposta declare o prazo.
   */
  prazo_entrega:
    'O prazo de entrega/execução do objeto será conforme estabelecido no Termo de Referência do Edital.',
};

/**
 * Declarações padrão que devem vir pré-selecionadas no wizard.
 * custos_trabalhistas é OBRIGATÓRIA (art. 63 §1º) e não pode ser desmarcada.
 */
export const DEFAULT_DECLARATIONS = [
  'exequibilidade',
  'tributos_inclusos',
  'custos_trabalhistas',  // OBRIGATÓRIA — art. 63 §1º
  'conhecimento_edital',
  'prazo_entrega',
  'validade_proposta',    // Handled specially with {dias} substitution
] as const;

/**
 * Declarações que são OBRIGATÓRIAS e não podem ser desmarcadas pelo usuário.
 */
export const MANDATORY_DECLARATIONS = [
  'exequibilidade',
  'tributos_inclusos',
  'custos_trabalhistas',
  'conhecimento_edital',
] as const;
