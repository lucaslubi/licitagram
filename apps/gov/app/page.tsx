import Link from 'next/link'

export default function LandingStub() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-8 px-6 py-24">
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium uppercase tracking-wide text-secondary-foreground">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
        Em construção — Fase 0
      </div>

      <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        <span className="text-foreground">LicitaGram</span>{' '}
        <span className="text-primary">Gov</span>
      </h1>

      <p className="max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
        Copiloto agêntico que escreve os documentos da fase interna das licitações públicas sob a{' '}
        <span className="font-medium text-foreground">Lei 14.133/2021</span> — PCA, DFD, ETP, Riscos,
        Pesquisa de Preços, TR, Edital e Parecer Jurídico, com compliance TCU determinístico.
      </p>

      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        {[
          { k: '3–5 dias', v: 'processo atual típico', tone: 'text-muted-foreground' },
          { k: '< 4 horas', v: 'com LicitaGram Gov', tone: 'text-primary' },
          { k: '~30k', v: 'órgãos elegíveis no Brasil', tone: 'text-muted-foreground' },
        ].map((item) => (
          <div key={item.v} className="rounded-lg border border-border bg-card p-4">
            <dt className={`font-mono text-xl font-semibold ${item.tone}`}>{item.k}</dt>
            <dd className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{item.v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-3 pt-4">
        <Link
          href="https://licitagram.com"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Conhecer o LicitaGram (B2B)
        </Link>
        <a
          href="mailto:contato@licitagram.com?subject=LicitaGram%20Gov%20-%20interesse"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-secondary"
        >
          Entrar na lista de espera
        </a>
      </div>

      <footer className="mt-auto pt-12 text-xs text-muted-foreground">
        © {new Date().getFullYear()} LicitaGram · Equipe Licitagram · Produto em desenvolvimento
      </footer>
    </main>
  )
}
