'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { signUpAction } from '@/lib/auth/actions'
import { signupSchema, type SignupInput } from '@/lib/validations/auth'

export function SignupForm() {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      nomeCompleto: '',
      email: '',
      password: '',
      confirmPassword: '',
      aceitouTermos: false as unknown as true,
    },
  })

  const onSubmit = (data: SignupInput) => {
    startTransition(async () => {
      const fd = new FormData()
      Object.entries(data).forEach(([k, v]) => fd.set(k, String(v)))
      const res = await signUpAction(fd)
      if (res.ok) {
        setDone(true)
        toast.success('Cadastro recebido! Verifique seu email para confirmar.')
      } else {
        toast.error(res.error)
        if (res.field) form.setError(res.field as keyof SignupInput, { message: res.error })
      }
    })
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-accent" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold">Quase lá</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enviamos um link de confirmação para seu email. Clique no link para ativar sua conta.
        </p>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="nomeCompleto"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome completo</FormLabel>
              <FormControl>
                <Input autoComplete="name" placeholder="Maria da Silva" disabled={pending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email institucional</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="maria@orgao.gov.br"
                  disabled={pending}
                  {...field}
                />
              </FormControl>
              <FormDescription>Use seu email do órgão. Domínios pessoais (gmail, hotmail) também funcionam no trial.</FormDescription>
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
                  autoComplete="new-password"
                  placeholder="Pelo menos 12 caracteres"
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
        <FormField
          control={form.control}
          name="aceitouTermos"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-lg border border-border p-3">
              <FormControl>
                <Checkbox
                  checked={!!field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  disabled={pending}
                />
              </FormControl>
              <div className="space-y-1 leading-tight">
                <FormLabel className="text-sm font-normal">
                  Li e aceito os{' '}
                  <a href="/termos" className="text-primary hover:underline">
                    Termos de Uso
                  </a>{' '}
                  e a{' '}
                  <a href="/privacidade" className="text-primary hover:underline">
                    Política de Privacidade
                  </a>
                  .
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? 'Criando conta...' : 'Criar conta'}
        </Button>
      </form>
    </Form>
  )
}
