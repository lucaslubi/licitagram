import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type ArtefatoStatus = 'rascunho' | 'gerando' | 'gerado' | 'revisao' | 'aprovado' | 'publicado'

const STATUS_LABEL: Record<ArtefatoStatus, string> = {
  rascunho: 'Rascunho',
  gerando: 'Gerando',
  gerado: 'Gerado',
  revisao: 'Em revisão',
  aprovado: 'Aprovado',
  publicado: 'Publicado',
}

const STATUS_STYLE: Record<ArtefatoStatus, string> = {
  rascunho: 'bg-muted text-muted-foreground border-border',
  gerando: 'bg-primary/10 text-primary border-primary/20 animate-pulse',
  gerado: 'bg-secondary text-secondary-foreground border-border',
  revisao: 'bg-warning/10 text-warning border-warning/30',
  aprovado: 'bg-accent/10 text-accent border-accent/30',
  publicado: 'bg-accent text-accent-foreground border-transparent',
}

export function StatusBadge({ status, className }: { status: ArtefatoStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_STYLE[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
