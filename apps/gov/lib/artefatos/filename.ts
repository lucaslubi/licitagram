/**
 * Constrói nomes de arquivo descritivos para exports de artefatos (PDF,
 * DOCX, MD). Antes desta função, os PDFs saíam com o título genérico do
 * root layout ("LicitaGram Gov — Automação de licitações…") porque o
 * browser usa `document.title` como filename default no "Save as PDF".
 *
 * Formato canônico:
 *   "{ARTEFATO} - {Objeto truncado} - Proc {numeroInterno}.{ext}"
 *
 * Exemplos:
 *   "ETP - Aquisição de papel A4 75g - Proc 2026-001.pdf"
 *   "Termo de Referência - Serviço de limpeza - Proc 042-2026.docx"
 *   "DFD - Contratação software de gestão.pdf"   (sem numero)
 */

import { ARTEFATO_LABEL, type ArtefatoTipo } from './prompts'

export interface FilenameParts {
  tipo: ArtefatoTipo | 'precos' | 'compliance' | 'riscos'
  objeto: string
  numeroInterno: string | null
  /** Extensão sem ponto ('pdf' | 'docx' | 'md'). null = sem extensão (pra document.title). */
  extension: 'pdf' | 'docx' | 'md' | null
}

/** Labels distintos pros pseudo-tipos que não são artefatos markdown. */
const EXTRA_LABELS: Record<string, string> = {
  precos: 'Pesquisa de Preços',
  compliance: 'Relatório de Compliance',
  riscos: 'Mapa de Riscos',
}

/**
 * Remove caracteres proibidos em filenames (Win: : / \ ? * " < > | + controle).
 * Normaliza acentos opcionalmente mas mantém unicode pra legibilidade.
 */
function sanitizeForFilename(s: string): string {
  return s
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // chars proibidos Win/POSIX
    .replace(/\s+/g, ' ')                   // whitespace múltiplo → único
    .replace(/[.\s]+$/g, '')                // trailing dots/spaces (Win bug)
    .trim()
}

/** Trunca preservando palavras inteiras (corta no último espaço antes do cap). */
function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()
}

export function buildArtefatoFilename(parts: FilenameParts): string {
  const label = ARTEFATO_LABEL[parts.tipo as ArtefatoTipo] ?? EXTRA_LABELS[parts.tipo as string] ?? String(parts.tipo).toUpperCase()
  const objeto = sanitizeForFilename(truncateAtWord(parts.objeto, 80))

  const segments: string[] = [label]
  if (objeto) segments.push(objeto)
  if (parts.numeroInterno) {
    const num = sanitizeForFilename(parts.numeroInterno).slice(0, 40)
    if (num) segments.push(`Proc ${num}`)
  }

  const base = segments.join(' - ')
  // Hard cap 180 chars (filesystem limit é ~255, folgamos pra paths longos)
  const capped = base.length > 180 ? base.slice(0, 180).trimEnd() : base

  return parts.extension ? `${capped}.${parts.extension}` : capped
}
