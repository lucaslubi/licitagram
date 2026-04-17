import type { Metadata } from 'next'
import Link from 'next/link'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Preços de Mercado em Licitações — Licitagram',
  description: 'Consulte preços praticados em licitações públicas brasileiras. Dados do PNCP, Painel de Preços, BPS Saúde e Dados Abertos consolidados por IA. Grátis.',
  keywords: [
    'preço licitação',
    'preço mercado pregão',
    'banco de preços',
    'painel de preços',
    'preço referência licitação',
    'histórico preços PNCP',
    'pesquisa preço licitação',
    'como calcular preço licitação',
  ],
  alternates: { canonical: 'https://licitagram.com/precos' },
  openGraph: {
    title: 'Preços de Mercado em Licitações — Licitagram',
    description: 'Consulte preços praticados em licitações públicas. 4 fontes oficiais consolidadas.',
    type: 'website',
    locale: 'pt_BR',
  },
}

// Seed queries for SEO long-tail — each produces a /precos/[slug] page
const POPULAR_QUERIES = [
  { slug: 'locacao-gerador', label: 'Locação de gerador' },
  { slug: 'material-escritorio', label: 'Material de escritório' },
  { slug: 'uniformes', label: 'Uniformes' },
  { slug: 'manutencao-predial', label: 'Manutenção predial' },
  { slug: 'servico-limpeza', label: 'Serviço de limpeza' },
  { slug: 'combustivel', label: 'Combustível' },
  { slug: 'medicamentos', label: 'Medicamentos' },
  { slug: 'equipamento-medico', label: 'Equipamento médico' },
  { slug: 'veiculos', label: 'Veículos' },
  { slug: 'software', label: 'Software' },
  { slug: 'consultoria', label: 'Consultoria' },
  { slug: 'obras-civis', label: 'Obras civis' },
]

export default function PrecosLandingPage() {
  const faqJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Como descobrir o preço de mercado real em licitações?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'O preço de mercado real em licitações vem do cruzamento de 4 fontes: PNCP (preços homologados), Painel de Preços Planejamento (federal), BPS Saúde (insumos médicos) e NF-e via Transparência. A Licitagram consolida automaticamente.',
        },
      },
      {
        '@type': 'Question',
        name: 'Qual a diferença entre preço de referência e preço de mercado?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Preço de referência é o que o órgão estima pagar no edital. Preço de mercado é o que fornecedores efetivamente praticam hoje. Quando divergem, você identifica oportunidade ou armadilha.',
        },
      },
      {
        '@type': 'Question',
        name: 'Consulta de preços na Licitagram é grátis?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Sim. A busca pública de preços na Licitagram é 100% gratuita. Para análises avançadas (estatísticas, exportação, benchmark por concorrente), é necessário plano pago.',
        },
      },
    ],
  })

  return (
    <div className="min-h-screen bg-background">
      <Script id="jsonld-faq-precos" type="application/ld+json" strategy="afterInteractive">
        {faqJsonLd}
      </Script>

      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-foreground tracking-tight">
            Licitagram
          </Link>
          <nav className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
            <Link href="/cases" className="hover:text-foreground transition-colors">Cases</Link>
            <Link href="/status" className="hover:text-foreground transition-colors">Status</Link>
            <Link href="/login" className="text-foreground">Entrar →</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand mb-3">
            Gratuito · 4 fontes oficiais
          </p>
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-foreground max-w-3xl mx-auto">
            Quanto o governo paga por cada produto ou serviço
          </h1>
          <p className="text-base text-muted-foreground mt-4 max-w-2xl mx-auto">
            Consulte preços reais praticados em licitações públicas. PNCP, Painel de Preços Planejamento,
            BPS Saúde e Dados Abertos — consolidados com IA.
          </p>
        </div>

        <form action="/precos/buscar" method="get" className="max-w-2xl mx-auto">
          <div className="bg-card border border-border rounded-xl p-2 flex gap-2">
            <input
              name="q"
              placeholder="Ex: locação de gerador 250 kva"
              className="flex-1 bg-transparent text-foreground px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              required
              minLength={3}
            />
            <button
              type="submit"
              className="bg-brand text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-brand-dark transition-colors"
            >
              Buscar
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Mínimo 3 caracteres. Sem cadastro.
          </p>
        </form>

        <div className="mt-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground text-center mb-4">
            Categorias populares
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-w-3xl mx-auto">
            {POPULAR_QUERIES.map((q) => (
              <Link
                key={q.slug}
                href={`/precos/${q.slug}`}
                className="bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-brand/30 transition-colors text-center"
              >
                {q.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3 mt-16">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">PNCP</p>
            <p className="text-sm font-medium text-foreground">Preços homologados</p>
            <p className="text-xs text-muted-foreground mt-1">Portal Nacional de Contratações Públicas</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Painel de Preços</p>
            <p className="text-sm font-medium text-foreground">Preços federais</p>
            <p className="text-xs text-muted-foreground mt-1">paineldeprecos.planejamento.gov.br</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">BPS Saúde</p>
            <p className="text-sm font-medium text-foreground">Medicamentos e insumos</p>
            <p className="text-xs text-muted-foreground mt-1">bps.saude.gov.br</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Dados Abertos</p>
            <p className="text-sm font-medium text-foreground">Contratos detalhados</p>
            <p className="text-xs text-muted-foreground mt-1">dadosabertos.compras.gov.br</p>
          </div>
        </div>

        <section className="mt-20">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Perguntas frequentes</h2>

          <div className="mt-6 space-y-4">
            <details className="bg-card border border-border rounded-xl p-5">
              <summary className="font-medium text-foreground cursor-pointer">
                Como descobrir o preço de mercado real em licitações?
              </summary>
              <p className="text-sm text-muted-foreground mt-3">
                O preço de mercado real vem do cruzamento de 4 fontes: PNCP (preços homologados),
                Painel de Preços Planejamento (federal), BPS Saúde (insumos médicos) e NF-e via
                Transparência. A Licitagram consolida automaticamente e emite um <strong className="text-foreground">Selo
                de Referência Validada</strong> quando 3+ fontes convergem.
              </p>
            </details>

            <details className="bg-card border border-border rounded-xl p-5">
              <summary className="font-medium text-foreground cursor-pointer">
                Qual a diferença entre preço de referência e preço de mercado?
              </summary>
              <p className="text-sm text-muted-foreground mt-3">
                Preço de referência é o que o órgão ESTIMA pagar no edital (geralmente com dados
                desatualizados de 6-12 meses). Preço de mercado é o que fornecedores efetivamente
                PRATICAM hoje. Quando divergem, você identifica oportunidade (edital acima do mercado)
                ou armadilha (edital abaixo do mercado).
              </p>
            </details>

            <details className="bg-card border border-border rounded-xl p-5">
              <summary className="font-medium text-foreground cursor-pointer">
                A consulta de preços na Licitagram é grátis?
              </summary>
              <p className="text-sm text-muted-foreground mt-3">
                Sim. Consulta pública é 100% gratuita. Para análises avançadas (estatísticas,
                exportação CSV, benchmark por concorrente, Floor Optimizer), plano pago a partir de R$199/mês.
              </p>
            </details>

            <details className="bg-card border border-border rounded-xl p-5">
              <summary className="font-medium text-foreground cursor-pointer">
                Como uso esses preços para parametrizar o robô de lances?
              </summary>
              <p className="text-sm text-muted-foreground mt-3">
                O valor final mínimo ótimo é ~2% abaixo da referência validada. Use o{' '}
                <Link href="/blog/como-calcular-valor-final-minimo-pregao" className="text-brand underline">
                  guia completo de cálculo
                </Link>{' '}
                ou deixe o Licitagram Floor Optimizer fazer automaticamente baseado no histórico
                de UASG e concorrentes.
              </p>
            </details>
          </div>
        </section>

        <div className="mt-20 bg-card border border-brand/30 rounded-xl p-8 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand mb-2">Pronto para ir além</p>
          <h3 className="text-2xl font-semibold text-foreground mb-3">
            Preço de mercado + matching IA + robô de lances
          </h3>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-5">
            Licitagram não é só consulta. É a plataforma completa usada pelo top 5% de licitantes
            do Brasil. 14 dias grátis.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-brand text-white rounded-lg px-6 py-3 text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            Começar agora →
          </Link>
        </div>
      </main>

      <footer className="border-t border-border mt-20">
        <div className="max-w-6xl mx-auto px-6 py-8 text-xs text-muted-foreground flex items-center justify-between">
          <p>© 2026 Licitagram — Licitações com inteligência</p>
          <div className="flex gap-4">
            <Link href="/blog" className="hover:text-foreground">Blog</Link>
            <Link href="/precos" className="hover:text-foreground">Preços</Link>
            <Link href="/cases" className="hover:text-foreground">Cases</Link>
            <Link href="/status" className="hover:text-foreground">Status</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
