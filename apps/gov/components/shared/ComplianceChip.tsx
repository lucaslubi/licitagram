import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ComplianceLevel = 'conforme' | 'pendente' | 'nao_conforme' | 'verificando'

const COMPLIANCE: Record<ComplianceLevel, { label: string; icon: typeof CheckCircle2; style: string }> = {
  conforme: {
    label: 'Conforme TCU',
    icon: CheckCircle2,
    style: 'bg-accent/10 text-accent border-accent/30',
  },
  pendente: {
    label: 'Pendência',
    icon: AlertTriangle,
    style: 'bg-warning/10 text-warning border-warning/30',
  },
  nao_conforme: {
    label: 'Não conforme',
    icon: XCircle,
    style: 'bg-destructive/10 text-destructive border-destructive/30',
  },
  verificando: {
    label: 'Verificando',
    icon: Loader2,
    style: 'bg-muted text-muted-foreground border-border',
  },
}

interface Props {
  level: ComplianceLevel
  detail?: string
  className?: string
}

export function ComplianceChip({ level, detail, className }: Props) {
  const { label, icon: Icon, style } = COMPLIANCE[level]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        style,
        className,
      )}
      title={detail}
    >
      <Icon className={cn('h-3.5 w-3.5', level === 'verificando' && 'animate-spin')} aria-hidden />
      {label}
    </span>
  )
}
