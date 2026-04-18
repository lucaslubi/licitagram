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
import { resetPasswordAction } from '@/lib/auth/actions'
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validations/auth'

export function ResetPasswordForm() {
  const [pending, startTransition] = useTransition()
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit = (data: ResetPasswordInput) => {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('password', data.password)
      fd.set('confirmPassword', data.confirmPassword)
      const res = await resetPasswordAction(fd)
      if (res && !res.ok) {
        toast.error(res.error)
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nova senha</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" disabled={pending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirmar senha</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" disabled={pending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? 'Salvando...' : 'Atualizar senha'}
        </Button>
      </form>
    </Form>
  )
}
