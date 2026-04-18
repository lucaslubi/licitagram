'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2 } from 'lucide-react'
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
import { forgotPasswordAction } from '@/lib/auth/actions'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth'

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = (data: ForgotPasswordInput) => {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('email', data.email)
      const res = await forgotPasswordAction(fd)
      if (res.ok) {
        setSent(true)
        toast.success('Link de recuperação enviado.')
      } else {
        toast.error(res.error)
      }
    })
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-accent" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold">Email enviado</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Se houver uma conta com esse email, você receberá um link para redefinir a senha em alguns instantes.
        </p>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email institucional</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="servidor@orgao.gov.br" disabled={pending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? 'Enviando...' : 'Enviar link'}
        </Button>
      </form>
    </Form>
  )
}
