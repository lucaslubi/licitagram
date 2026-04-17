import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-4 px-6">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="text-muted-foreground">
        O endereço que você acessou não existe ou foi removido.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Voltar ao início
      </Link>
    </main>
  )
}
