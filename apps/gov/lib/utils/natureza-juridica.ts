/**
 * Mapeamento de códigos de Natureza Jurídica (RFB / IBGE) para
 * (esfera, poder) usados pelo schema licitagov.orgaos.
 *
 * Lista oficial: https://concla.ibge.gov.br/estrutura/natjur-estrutura/natureza-juridica-2018
 * Cobrimos os códigos que valem pra órgãos públicos da fase interna de
 * licitações (Lei 14.133/2021). Códigos privados retornam null.
 */
export type Esfera = 'federal' | 'estadual' | 'municipal' | 'distrital'
export type Poder = 'executivo' | 'legislativo' | 'judiciario' | 'autonomo'

export interface NaturezaInfo {
  esfera: Esfera
  poder: Poder
  label: string
}

const TABLE: Record<string, NaturezaInfo> = {
  // Executivo
  '1015': { esfera: 'federal', poder: 'executivo', label: 'Órgão Público do Executivo Federal' },
  '1023': { esfera: 'estadual', poder: 'executivo', label: 'Órgão Público do Executivo Estadual ou Distrital' },
  '1031': { esfera: 'municipal', poder: 'executivo', label: 'Órgão Público do Executivo Municipal' },
  // Legislativo
  '1040': { esfera: 'federal', poder: 'legislativo', label: 'Órgão Público do Legislativo Federal' },
  '1058': { esfera: 'estadual', poder: 'legislativo', label: 'Órgão Público do Legislativo Estadual ou Distrital' },
  '1066': { esfera: 'municipal', poder: 'legislativo', label: 'Órgão Público do Legislativo Municipal' },
  // Judiciário
  '1074': { esfera: 'federal', poder: 'judiciario', label: 'Órgão Público do Judiciário Federal' },
  '1082': { esfera: 'estadual', poder: 'judiciario', label: 'Órgão Público do Judiciário Estadual' },
  // Autarquias / Fundações / Empresas estatais (todos esfera variável; assumimos federal por padrão e deixamos override)
  '1104': { esfera: 'federal', poder: 'autonomo', label: 'Autarquia Federal' },
  '1112': { esfera: 'estadual', poder: 'autonomo', label: 'Autarquia Estadual ou Distrital' },
  '1120': { esfera: 'municipal', poder: 'autonomo', label: 'Autarquia Municipal' },
  '1139': { esfera: 'federal', poder: 'autonomo', label: 'Fundação Pública de Direito Público Federal' },
  '1147': { esfera: 'estadual', poder: 'autonomo', label: 'Fundação Pública de Direito Público Estadual' },
  '1155': { esfera: 'municipal', poder: 'autonomo', label: 'Fundação Pública de Direito Público Municipal' },
  '2011': { esfera: 'federal', poder: 'autonomo', label: 'Empresa Pública' },
  '2038': { esfera: 'federal', poder: 'autonomo', label: 'Sociedade de Economia Mista' },
}

/** Normaliza códigos com pontuação ("101-5") para chave numérica ("1015"). */
function normalize(code: string | number | null | undefined): string {
  if (code == null) return ''
  return String(code).replace(/\D/g, '')
}

export function lookupNatureza(code: string | number | null | undefined): NaturezaInfo | null {
  const key = normalize(code)
  return TABLE[key] ?? null
}

export function isPublicOrgan(code: string | number | null | undefined): boolean {
  return lookupNatureza(code) !== null
}

export const NATUREZAS_PUBLICAS = Object.keys(TABLE)
