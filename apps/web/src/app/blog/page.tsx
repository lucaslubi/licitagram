import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllArticles } from '@/content/blog/articles'

export const metadata: Metadata = {
  title: 'Blog — Licitagram | Licitações Públicas em 2026',
  description: 'Guias, análises e estratégias para ganhar licitações públicas. IN 73/2022, Lei 14.133, preço de mercado, robô de lances, compliance e mais.',
  alternates: { canonical: 'https://licitagram.com/blog' },
  openGraph: {
    title: 'Blog Licitagram',
    description: 'Conteúdo definitivo para licitantes profissionais',
    type: 'website',
    locale: 'pt_BR',
  },
}

const CATEGORY_LABEL: Record<string, string> = {
  legislacao: 'Legislação',
  estrategia: 'Estratégia',
  'como-fazer': 'Como fazer',
  tecnologia: 'Tecnologia',
  mercado: 'Mercado',
}

export default function BlogIndexPage() {
  const articles = getAllArticles()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-foreground tracking-tight">
            Licitagram
          </Link>
          <nav className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/precos" className="hover:text-foreground transition-colors">Preços de Mercado</Link>
            <Link href="/cases" className="hover:text-foreground transition-colors">Cases</Link>
            <Link href="/status" className="hover:text-foreground transition-colors">Status</Link>
            <Link href="/login" className="text-foreground">Entrar →</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand mb-2">Blog Licitagram</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            Conteúdo definitivo para licitantes profissionais
          </h1>
          <p className="text-base text-muted-foreground mt-3 max-w-2xl">
            Guias, análises e estratégias baseados em dados reais de {'> '}2 milhões de pregões monitorados.
            Sem fluff, sem opinião — só o que funciona.
          </p>
        </div>

        <div className="grid gap-4">
          {articles.map((article) => (
            <Link
              key={article.meta.slug}
              href={`/blog/${article.meta.slug}`}
              className="group bg-card border border-border rounded-xl p-5 hover:border-brand/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand">
                  {CATEGORY_LABEL[article.meta.category]}
                </span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                  {article.meta.readingTimeMin} min
                </span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                  {new Date(article.meta.publishedAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-foreground group-hover:text-brand transition-colors tracking-tight">
                {article.meta.title}
              </h2>
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {article.meta.description}
              </p>
            </Link>
          ))}
        </div>

        <div className="mt-16 bg-card border border-border rounded-xl p-6 text-center">
          <p className="text-xs text-muted-foreground mb-2">Assine para receber novos guias</p>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Estratégias que funcionam, na sua caixa de entrada
          </h3>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-brand text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            Começar grátis — 7 dias →
          </Link>
        </div>
      </main>

      <footer className="border-t border-border mt-20">
        <div className="max-w-4xl mx-auto px-6 py-8 text-xs text-muted-foreground flex items-center justify-between">
          <p>© 2026 Licitagram — Licitações com inteligência</p>
          <div className="flex gap-4">
            <Link href="/blog" className="hover:text-foreground">Blog</Link>
            <Link href="/precos" className="hover:text-foreground">Preços</Link>
            <Link href="/status" className="hover:text-foreground">Status</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
