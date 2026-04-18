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
import { signInAction } from '@/lib/auth/actions'
import { loginSchema, type LoginInput } from '@/lib/validations/auth'

export function LoginForm() {
  const [pending, startTransition] = useTransition()
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = (data: LoginInput) => {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('email', data.email)
      fd.set('password', data.password)
      const res = await signInAction(fd)
      if (res && !res.ok) {
        toast.error(res.error)
        if (res.field) form.setError(res.field as keyof LoginInput, { message: res.error })
      }
      // success: server action redirects, this code path is only hit on error
    })
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
                <Input
                  type="email"
                  autoComplete="username"
                  placeholder="servidor@orgao.gov.br"
                  disabled={pending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Senha</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••••••"
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
          {pending ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>
    </Form>
  )
}
