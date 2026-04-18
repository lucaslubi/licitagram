'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { signInWithGoogleAction } from '@/lib/auth/actions'

export function GoogleButton({ label = 'Continuar com Google' }: { label?: string }) {
  const [pending, startTransition] = useTransition()

  const onClick = () => {
    startTransition(async () => {
      const res = await signInWithGoogleAction()
      if (res && !res.ok) toast.error(res.error)
    })
  }

  return (
    <Button type="button" variant="outline" className="w-full" onClick={onClick} disabled={pending}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#EA4335"
            d="M12 11v3.2h4.5c-.2 1.3-1.5 3.7-4.5 3.7-2.7 0-4.9-2.2-4.9-5s2.2-5 4.9-5c1.5 0 2.6.6 3.2 1.2l2.2-2.1C15.9 5.7 14.1 5 12 5c-3.9 0-7 3.1-7 7s3.1 7 7 7c4 0 6.7-2.8 6.7-6.8 0-.5 0-.8-.1-1.2H12z"
          />
        </svg>
      )}
      {label}
    </Button>
  )
}

export function AuthDivider({ label = 'ou' }: { label?: string }) {
  return (
    <div className="relative my-2">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-2 text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}
