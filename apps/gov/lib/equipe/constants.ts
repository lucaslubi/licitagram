export const PAPEIS = [
  'requisitante',
  'agente_contratacao',
  'coordenador',
  'assessor_juridico',
  'ordenador_despesa',
  'admin',
] as const

export type Papel = typeof PAPEIS[number]

export const PAPEL_LABEL: Record<Papel, string> = {
  requisitante: 'Requisitante',
  agente_contratacao: 'Agente de contratação',
  coordenador: 'Coordenador',
  assessor_juridico: 'Assessor jurídico',
  ordenador_despesa: 'Ordenador de despesa',
  admin: 'Administrador',
}
