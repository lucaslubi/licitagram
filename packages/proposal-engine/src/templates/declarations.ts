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
 */

export const DECLARATION_TEXTS: Record<string, string> = {
  /**
   * Declaração de exequibilidade de preços.
   * Fundamentação: Lei 14.133/2021, art. 59, §4º — O licitante que ofertar preço
   * considerado inexequível deverá demonstrar que os custos dos insumos são coerentes
   * com os de mercado e que os coeficientes de produtividade são compatíveis com a
   * execução do objeto.
   */
  exequibilidade:
    'Declaramos, sob as penas da lei, que os preços propostos são exequíveis e foram elaborados de forma independente, sem qualquer forma de conluio ou acordo com outros licitantes, contemplando todos os custos diretos e indiretos necessários à plena execução do objeto, nos termos do art. 59 da Lei nº 14.133/2021. Comprometemo-nos a demonstrar a viabilidade dos preços ofertados sempre que solicitado pela Administração.',

  /**
   * Declaração de inclusão de tributos, encargos e despesas nos preços.
   * Fundamentação: Lei 14.133/2021, art. 12, XII — dever de parcelar o objeto,
   * quando compatível; art. 63, §1º — composição de preços.
   */
  tributos_inclusos:
    'Declaramos que nos preços propostos estão incluídos todos os custos operacionais, encargos previdenciários, trabalhistas, tributários, comerciais, fretes, seguros e quaisquer outros que incidam direta ou indiretamente sobre o fornecimento dos bens e/ou prestação dos serviços, conforme exigido pelo instrumento convocatório, não cabendo à Contratante nenhum custo ou despesa adicional além do valor ofertado.',

  /**
   * Declaração de conhecimento e concordância com o edital.
   * Fundamentação: Lei 14.133/2021, art. 12, I a IV — princípios da licitação.
   */
  conhecimento_edital:
    'Declaramos que examinamos, conhecemos e nos submetemos integralmente às condições constantes do Edital e seus Anexos, inclusive quanto ao Termo de Referência e à Minuta do Contrato, que a proposta apresentada compreende a integralidade dos custos para atendimento dos direitos trabalhistas assegurados na Constituição Federal, nas leis trabalhistas, nas normas infra-legais, nas convenções coletivas de trabalho e nos termos de ajustamento de conduta vigentes na data de entrega das propostas, nos termos do §1º do art. 63 da Lei nº 14.133/2021.',

  /**
   * Declaração de enquadramento como ME/EPP.
   * Fundamentação: Lei Complementar nº 123/2006, art. 3º;
   * Lei 14.133/2021, art. 4º — aplicação subsidiária da LC 123.
   */
  me_epp:
    'Declaramos, para fins do disposto no item pertinente do Edital, sob as sanções administrativas cabíveis e sob as penas da lei, que esta empresa, na presente data, é considerada Microempresa ou Empresa de Pequeno Porte, nos termos da Lei Complementar nº 123, de 14 de dezembro de 2006, alterada pela Lei Complementar nº 147, de 7 de agosto de 2014, e que não se enquadra em nenhuma das hipóteses de exclusão previstas no §4º do art. 3º da referida Lei Complementar, estando apta a usufruir do tratamento favorecido estabelecido nos arts. 42 a 49 da Lei Complementar nº 123/2006.',

  /**
   * Declaração de cumprimento do art. 7º, XXXIII da Constituição Federal.
   * Fundamentação: CF/88, art. 7º, XXXIII; Lei 14.133/2021, art. 68, VI.
   */
  sem_vinculo:
    'Declaramos, para os devidos fins e sob as penas da lei, em cumprimento ao exigido no inciso XXXIII do art. 7º da Constituição Federal combinado com o inciso VI do art. 68 da Lei nº 14.133/2021, que não empregamos menores de dezoito anos em trabalho noturno, perigoso ou insalubre e que não empregamos menores de dezesseis anos em qualquer trabalho, salvo na condição de aprendiz, a partir dos quatorze anos.',
};
