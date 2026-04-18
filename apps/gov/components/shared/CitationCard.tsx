import { Scale } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface JuridicalCitation {
  lei?: string
  artigo?: string
  paragrafo?: string
  inciso?: string
  alinea?: string
  acordao?: string
  link?: string
}

function formatCitation(c: JuridicalCitation): string {
  const parts: string[] = []
  if (c.lei) parts.push(c.lei)
  if (c.artigo) parts.push(`art. ${c.artigo}`)
  if (c.paragrafo) parts.push(`§ ${c.paragrafo}`)
  if (c.inciso) parts.push(`inciso ${c.inciso}`)
  if (c.alinea) parts.push(`alínea "${c.alinea}"`)
  if (c.acordao) parts.push(c.acordao)
  return parts.join(', ')
}

interface Props {
  citation: JuridicalCitation
  excerpt?: string
  className?: string
}

/**
 * Mostra a fonte jurídica que embasou um output IA. Obrigatório em qualquer
 * texto gerado por LLM no produto (RI-13: rastreabilidade TCU).
 */
export function CitationCard({ citation, excerpt, className }: Props) {
  const formatted = formatCitation(citation)
  return (
    <aside
      className={cn(
        'flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm',
        className,
      )}
    >
      <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-primary">{formatted}</p>
        {excerpt && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{excerpt}</p>}
        {citation.link && (
          <a
            href={citation.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-xs text-primary underline-offset-2 hover:underline"
          >
            Ver fonte oficial
          </a>
        )}
      </div>
    </aside>
  )
}
