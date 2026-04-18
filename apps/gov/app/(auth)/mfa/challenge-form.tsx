'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { mfaChallengeAction } from '@/lib/auth/actions'
import { mfaChallengeSchema, type MfaChallengeInput } from '@/lib/validations/auth'

export function MfaChallengeForm() {
  const [pending, startTransition] = useTransition()
  const form = useForm<MfaChallengeInput>({
    resolver: zodResolver(mfaChallengeSchema),
    defaultValues: { code: '' },
  })

  const onSubmit = (data: MfaChallengeInput) => {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('code', data.code)
      const res = await mfaChallengeAction(fd)
      if (res && !res.ok) {
        toast.error(res.error)
        form.setError('code', { message: res.error })
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código de 6 dígitos</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center font-mono text-2xl tracking-[0.5em]"
                  disabled={pending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? 'Verificando...' : 'Confirmar'}
        </Button>
      </form>
    </Form>
  )
}
