import type { Metadata } from 'next'
import Link from 'next/link'
import Script from 'next/script'
import { notFound } from 'next/navigation'
import { getAllArticles, getArticleBySlug } from '@/content/blog/articles'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return getAllArticles().map((a) => ({ slug: a.meta.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const article = getArticleBySlug(slug)
  if (!article) return { title: 'Artigo não encontrado' }

  return {
    title: `${article.meta.title} | Licitagram`,
    description: article.meta.description,
    keywords: article.meta.keywords,
    authors: [{ name: article.meta.author }],
    alternates: { canonical: `https://licitagram.com/blog/${slug}` },
    openGraph: {
      title: article.meta.title,
      description: article.meta.description,
      type: 'article',
      publishedTime: article.meta.publishedAt,
      modifiedTime: article.meta.updatedAt ?? article.meta.publishedAt,
      authors: [article.meta.author],
      locale: 'pt_BR',
    },
    twitter: {
      card: 'summary_large_image',
      title: article.meta.title,
      description: article.meta.description,
    },
  }
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const article = getArticleBySlug(slug)
  if (!article) notFound()

  const all = getAllArticles()
  const idx = all.findIndex((a) => a.meta.slug === slug)
  const related = all.filter((_, i) => i !== idx).slice(0, 3)

  const { meta, Component } = article

  // JSON-LD structured data for SEO — server-rendered from trusted source
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.description,
    keywords: meta.keywords.join(', '),
    datePublished: meta.publishedAt,
    dateModified: meta.updatedAt ?? meta.publishedAt,
    author: { '@type': 'Organization', name: meta.author },
    publisher: {
      '@type': 'Organization',
      name: 'Licitagram',
      url: 'https://licitagram.com',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://licitagram.com/blog/${meta.slug}`,
    },
  })

  return (
    <div className="min-h-screen bg-background">
      <Script
        id={`jsonld-article-${meta.slug}`}
        type="application/ld+json"
        strategy="afterInteractive"
      >
        {jsonLd}
      </Script>

      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-foreground tracking-tight">
            Licitagram
          </Link>
          <nav className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/blog" className="hover:text-foreground transition-colors">← Blog</Link>
            <Link href="/login" className="text-foreground">Entrar →</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/blog" className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-4 inline-block">
            ← Todos os artigos
          </Link>
          <div className="flex items-center gap-2 mb-3 mt-4">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand">
              {meta.category}
            </span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
              {meta.readingTimeMin} min de leitura
            </span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <time className="text-[10px] text-muted-foreground font-mono tabular-nums" dateTime={meta.publishedAt}>
              {new Date(meta.publishedAt).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </time>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold text-foreground tracking-tight leading-tight">
            {meta.title}
          </h1>
          <p className="text-base text-muted-foreground mt-4">{meta.description}</p>
        </div>

        <article className="prose prose-invert max-w-none">
          <Component />
        </article>

        <div className="mt-16 bg-card border border-brand/30 rounded-xl p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand mb-2">Comece agora</p>
          <h3 className="text-xl font-semibold text-foreground mb-2">
            Coloque em prática o que você leu
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Licitagram combina matching IA, monitor de chat, robô de lances e inteligência de preços
            em uma só plataforma. 7 dias grátis.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-brand text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            Testar grátis →
          </Link>
        </div>

        {related.length > 0 && (
          <div className="mt-12">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-4">
              Continue lendo
            </p>
            <div className="grid gap-3">
              {related.map((r) => (
                <Link
                  key={r.meta.slug}
                  href={`/blog/${r.meta.slug}`}
                  className="bg-card border border-border rounded-xl p-4 hover:border-brand/30 transition-colors"
                >
                  <p className="text-sm font-medium text-foreground">{r.meta.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{r.meta.description}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border mt-20">
        <div className="max-w-4xl mx-auto px-6 py-8 text-xs text-muted-foreground flex items-center justify-between">
          <p>© 2026 Licitagram</p>
          <Link href="/blog" className="hover:text-foreground">Blog</Link>
        </div>
      </footer>
    </div>
  )
}
