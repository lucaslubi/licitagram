export interface CNAECode {
  codigo: string
  descricao: string
}

export const COMMON_CNAES: CNAECode[] = [
  { codigo: '6201-5/01', descricao: 'Desenvolvimento de programas de computador sob encomenda' },
  { codigo: '6202-3/00', descricao: 'Desenvolvimento e licenciamento de programas de computador customizáveis' },
  { codigo: '6203-1/00', descricao: 'Desenvolvimento e licenciamento de programas de computador não-customizáveis' },
  { codigo: '6204-0/00', descricao: 'Consultoria em tecnologia da informação' },
  { codigo: '6209-1/00', descricao: 'Suporte técnico, manutenção e outros serviços em TI' },
  { codigo: '6311-9/00', descricao: 'Tratamento de dados, provedores de serviços de aplicação e serviços de hospedagem' },
  { codigo: '4751-2/01', descricao: 'Comércio varejista especializado de equipamentos e suprimentos de informática' },
  { codigo: '4321-5/00', descricao: 'Instalação e manutenção elétrica' },
  { codigo: '4120-4/00', descricao: 'Construção de edifícios' },
  { codigo: '4399-1/01', descricao: 'Administração de obras' },
  { codigo: '4110-7/00', descricao: 'Incorporação de empreendimentos imobiliários' },
  { codigo: '7112-0/00', descricao: 'Serviços de engenharia' },
  { codigo: '7111-1/00', descricao: 'Serviços de arquitetura' },
  { codigo: '8121-4/00', descricao: 'Limpeza em prédios e em domicílios' },
  { codigo: '8011-1/01', descricao: 'Atividades de vigilância e segurança privada' },
  { codigo: '5611-2/01', descricao: 'Restaurantes e similares' },
  { codigo: '4930-2/02', descricao: 'Transporte rodoviário de carga' },
  { codigo: '4921-3/02', descricao: 'Transporte rodoviário coletivo de passageiros' },
  { codigo: '8299-7/99', descricao: 'Outras atividades de serviços prestados às empresas' },
  { codigo: '4789-0/99', descricao: 'Comércio varejista de outros produtos não especificados' },
]

export const UFS_BRASIL = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR',
  'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const

export type UF = (typeof UFS_BRASIL)[number]
