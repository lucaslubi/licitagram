import Link from 'next/link'
import { Logo } from '@/components/app/Logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <main className="flex flex-col px-6 py-10 sm:px-12 lg:px-20">
        <Link href="/" aria-label="Voltar à home">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">{children}</div>
        <footer className="mt-8 text-xs text-muted-foreground">
          © {new Date().getFullYear()} LicitaGram · Equipe Licitagram
        </footer>
      </main>

      <aside className="hidden bg-secondary/40 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          Lei 14.133/2021 · Compliance TCU determinístico
        </div>
        <blockquote className="space-y-4">
          <p className="text-balance text-2xl font-medium leading-relaxed">
            “Em 4 horas a gente publica o que antes levava uma semana inteira de Excel e e-mail.”
          </p>
          <footer className="text-sm text-muted-foreground">— Servidor piloto, governo municipal</footer>
        </blockquote>
        <div className="flex gap-6 text-sm">
          <Link href="/precos" className="text-muted-foreground hover:text-foreground">
            Preços
          </Link>
          <Link href="/sobre" className="text-muted-foreground hover:text-foreground">
            Sobre
          </Link>
          <a
            href="https://www.gov.br/compras/pt-br"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            Compras.gov.br
          </a>
        </div>
      </aside>
    </div>
  )
}
