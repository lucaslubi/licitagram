import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

interface Props {
  missingFields: ('phone' | 'email')[]
}

export function ProfileCompletionBanner({ missingFields }: Props) {
  if (missingFields.length === 0) return null

  const fieldLabels: Record<string, string> = {
    phone: 'telefone',
    email: 'email',
  }
  const labels = missingFields.map((f) => fieldLabels[f]).join(' e ')

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-300 px-4 py-3 rounded-lg flex items-center gap-3">
      <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">Complete seu perfil pra receber oportunidades</p>
        <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
          Estamos sem seu {labels}. Sem isso, nossa IA não consegue te alertar de licitações que combinam com seu negócio.
        </p>
      </div>
      <Link
        href="/conta/perfil"
        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-md whitespace-nowrap transition-colors"
      >
        Completar perfil
      </Link>
    </div>
  )
}
