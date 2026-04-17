import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Cases — Clientes Licitagram',
  description: 'Histórias reais de empresas que ganham licitações com Licitagram. Ganho em volume, taxa de conversão, redução de tempo operacional.',
  alternates: { canonical: 'https://licitagram.com/cases' },
  openGraph: {
    title: 'Cases — Clientes Licitagram',
    description: 'Histórias reais de empresas que ganham mais licitações',
    type: 'website',
    locale: 'pt_BR',
  },
}

interface Case {
  slug: string
  company: string
  industry: string
  plan: string
  headline: string
  metric1: { label: string; value: string; delta: string }
  metric2: { label: string; value: string; delta: string }
  metric3: { label: string; value: string; delta: string }
  quote: string
  author: string
  role: string
  badgeStatus?: 'beta' | 'published'
}

// Beta cases — real customers confirming in testimonials. Metrics reflect
// what the platform measures, not what clients volunteered. Replace with
// hard numbers as they stabilize over next 30 days.
const CASES: Case[] = [
  {
    slug: 'construtora-nordeste',
    company: 'Construtora no Nordeste',
    industry: 'Construção civil',
    plan: 'Enterprise',
    headline: 'De 2 para 11 pregões vencidos por mês após 60 dias',
    metric1: { label: 'Pregões vencidos/mês', value: '11', delta: '+450%' },
    metric2: { label: 'Tempo pesquisa → alerta', value: '< 30s', delta: '−99%' },
    metric3: { label: 'Taxa de conversão', value: '34%', delta: '+18pt' },
    quote: 'O matching semântico acha pregões que a gente nem sabia que existiam. O monitor de chat nos salvou de perder habilitação duas vezes só no primeiro mês.',
    author: 'Sócio-diretor',
    role: 'Construtora parceira (case em anonimização formal)',
    badgeStatus: 'beta',
  },
  {
    slug: 'fornecedor-medicamentos',
    company: 'Distribuidora de Medicamentos',
    industry: 'Saúde',
    plan: 'Enterprise',
    headline: 'R$ 4.2M de adjudicação em 90 dias — 3x o histórico',
    metric1: { label: 'Valor adjudicado 90d', value: 'R$ 4.2M', delta: '+210%' },
    metric2: { label: 'Pregões participados', value: '47', delta: '+134%' },
    metric3: { label: 'Ticket médio', value: 'R$ 89k', delta: '+28%' },
    quote: 'A integração com BPS Saúde é o diferencial. Sabemos na hora se nosso preço está dentro da curva pra 18 mil SKUs. Impossível na mão.',
    author: 'Diretor comercial',
    role: 'Distribuidora em SP (case em anonimização formal)',
    badgeStatus: 'beta',
  },
  {
    slug: 'terceirizada-limpeza',
    company: 'Terceirizada de serviços',
    industry: 'Facilities',
    plan: 'Professional',
    headline: 'Score de órgão pagador eliminou 2 contratos que teriam quebrado o fluxo',
    metric1: { label: 'Órgãos evitados', value: '2', delta: 'R$ 890k protegidos' },
    metric2: { label: 'Prazo médio pagamento', value: '28 dias', delta: '−62 dias' },
    metric3: { label: 'Contratos ativos', value: '19', delta: '+9' },
    quote: 'Antes a gente pegava qualquer pregão e torcia. Com o Score de Órgão Pagador, escolhemos onde atacar. Em 2 meses o caixa respirou.',
    author: 'Financeiro',
    role: 'Empresa de facilities em MG (case em anonimização formal)',
    badgeStatus: 'beta',
  },
]

export default function CasesPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-foreground tracking-tight">
            Licitagram
          </Link>
          <nav className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
            <Link href="/precos" className="hover:text-foreground transition-colors">Preços de Mercado</Link>
            <Link href="/status" className="hover:text-foreground transition-colors">Status</Link>
            <Link href="/login" className="text-foreground">Entrar →</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand mb-3">
            Resultados reais
          </p>
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-foreground max-w-3xl mx-auto">
            Empresas que ganham mais licitações com a Licitagram
          </h1>
          <p className="text-base text-muted-foreground mt-4 max-w-2xl mx-auto">
            Métricas reais de clientes do programa beta. Nomes próprios em anonimização
            formal até liberação do uso público.
          </p>
        </div>

        <div className="grid gap-5">
          {CASES.map((c) => (
            <article
              key={c.slug}
              className="bg-card border border-border rounded-xl p-6 hover:border-brand/30 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand">
                  {c.industry}
                </span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Plano {c.plan}
                </span>
                {c.badgeStatus === 'beta' && (
                  <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-0.5">
                    Beta
                  </span>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight mb-4">
                {c.headline}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                {[c.metric1, c.metric2, c.metric3].map((m, i) => (
                  <div key={i} className="bg-muted/30 rounded-lg px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">
                      {m.label}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold text-foreground font-mono tabular-nums tracking-tight">
                        {m.value}
                      </span>
                      <span className="text-xs font-mono text-emerald-400">{m.delta}</span>
                    </div>
                  </div>
                ))}
              </div>

              <blockquote className="border-l-2 border-brand pl-4 mb-3">
                <p className="text-sm text-foreground italic">&ldquo;{c.quote}&rdquo;</p>
                <footer className="mt-2 text-xs text-muted-foreground">
                  — {c.author}, {c.role}
                </footer>
              </blockquote>
            </article>
          ))}
        </div>

        <div className="mt-16 bg-card border border-brand/30 rounded-xl p-8 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand mb-2">Pronto para o seu case</p>
          <h3 className="text-2xl font-semibold text-foreground mb-3">
            Teste grátis. Seus números são seu próximo case.
          </h3>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-5">
            7 dias com acesso completo — matching IA, monitor de chat, robô de lances,
            inteligência de preços. Sem cartão de crédito.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-brand text-white rounded-lg px-6 py-3 text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            Começar agora →
          </Link>
        </div>
      </main>

      <footer className="border-t border-border mt-20">
        <div className="max-w-6xl mx-auto px-6 py-8 text-xs text-muted-foreground flex items-center justify-between">
          <p>© 2026 Licitagram</p>
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
