import Link from 'next/link'
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  GanttChartSquare,
  ScanSearch,
  Scale,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { Logo } from '@/components/app/Logo'

const FEATURES = [
  { icon: ClipboardList, label: 'PCA Collector', detail: 'Coleta demandas dos setores via link único mobile-first + consolida com IA.' },
  { icon: FileCheck2, label: 'DFD + ETP (13 incisos)', detail: 'Gera documentos da fase interna citando Lei 14.133/2021 em cada parágrafo.' },
  { icon: Scale, label: 'Mapa de Riscos', detail: 'Matriz 3×3 gerada por IA com tratamento e mitigação acionáveis.' },
  { icon: TrendingUp, label: 'Cesta de Preços', detail: 'Busca PNCP + fornecedor direto. Mín 3 fontes (Acórdão 1.875/2021-TCU).' },
  { icon: GanttChartSquare, label: 'TR + Edital + Parecer', detail: '10 alíneas do art. 6º XXIII, art. 25, art. 53 — cada seção com citação rastreável.' },
  { icon: ScanSearch, label: 'Compliance Engine', detail: 'Regras TCU em código puro — bloqueia publicação se houver pendência crítica.' },
]

const STEPS = [
  { n: '1', title: 'Cadastro com seu CNPJ', detail: 'Em 3 minutos. Busca dados na Receita Federal, você só confirma.' },
  { n: '2', title: 'Colete PCA ou crie processo', detail: 'Setores respondem via link mobile. Ou abra direto um processo de licitação.' },
  { n: '3', title: 'IA redige artefatos', detail: 'DFD, ETP, Riscos, Preços, TR, Edital, Parecer — com citações legais.' },
  { n: '4', title: 'Compliance + publica', detail: 'Engine determinístico libera ou bloqueia. Publicação PNCP com audit trail completo.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <nav className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="border-b border-border bg-gradient-to-b from-background to-secondary/20">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium uppercase tracking-wide text-secondary-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
            Lei 14.133/2021 · Compliance TCU determinístico
          </div>

          <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            A fase interna da sua licitação,{' '}
            <span className="text-primary">do DFD ao Edital</span>, em poucas horas.
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            IA agêntica especializada em Lei 14.133/2021 gera cada artefato com citação legal rastreável.
            Compliance Engine determinístico bloqueia publicações inadequadas. Funciona com qualquer órgão público.
          </p>

          <dl className="mt-8 grid max-w-3xl grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="font-mono text-2xl font-semibold text-muted-foreground">3–5 dias</dt>
              <dd className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">tempo atual típico</dd>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <dt className="font-mono text-2xl font-semibold text-primary">&lt; 4 horas</dt>
              <dd className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">com LicitaGram Gov</dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="font-mono text-2xl font-semibold text-muted-foreground">~30 mil</dt>
              <dd className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">órgãos elegíveis no Brasil</dd>
            </div>
          </dl>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/cadastro"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Começar grátis <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-6 text-sm font-medium text-foreground transition hover:bg-secondary"
            >
              Já tenho conta
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            30 dias grátis · sem cartão · funciona com conta Google (SSO)
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-primary">A fase interna completa, automatizada</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Cada artefato com citação jurídica rastreável
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              Nada de PDF opaco. Cada parágrafo gerado pela IA aponta o dispositivo legal ou acórdão TCU que o embasa.
            </p>
          </div>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.label} className="rounded-2xl border border-border bg-card p-6">
                <f.icon className="h-6 w-6 text-primary" aria-hidden />
                <h3 className="mt-4 text-base font-semibold">{f.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-border bg-secondary/20">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-primary">Como funciona</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Do cadastro à publicação</h2>
          </div>
          <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="relative rounded-2xl border border-border bg-card p-6">
                <span className="absolute -top-3 -left-3 grid h-8 w-8 place-items-center rounded-full bg-primary font-mono text-sm font-semibold text-primary-foreground">
                  {s.n}
                </span>
                <h3 className="mt-2 text-base font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-primary">Preço honesto</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Planos por porte de órgão
            </h2>
            <p className="mt-4 text-muted-foreground">
              30 dias grátis em qualquer plano. Sem cartão no cadastro.
            </p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            <PriceCard
              name="Municipal"
              price="R$ 2.990/mês"
              tag="Até 100k habitantes"
              features={['Até 5 usuários', 'Processos ilimitados', 'IA Gemini 2.5', 'Compliance Engine', 'Suporte email']}
              cta="Começar teste"
            />
            <PriceCard
              name="Estadual"
              price="R$ 9.990/mês"
              tag="Mais popular"
              highlighted
              features={[
                'Até 25 usuários',
                'Processos ilimitados',
                'IA Gemini 2.5 Pro',
                'Compliance Engine',
                'Audit log completo',
                'Suporte prioritário',
              ]}
              cta="Começar teste"
            />
            <PriceCard
              name="Enterprise"
              price="sob consulta"
              tag="Multi-órgão, federal"
              features={[
                'Usuários ilimitados',
                'SSO + SAML',
                'SLA contratual',
                'Customização + integração',
                'Infra dedicada opcional',
                'Onboarding guiado',
              ]}
              cta="Falar com vendas"
              ctaHref="mailto:contato@licitagram.com?subject=LicitaGram%20Gov%20Enterprise"
            />
          </div>
        </div>
      </section>

      {/* CTA + footer */}
      <section className="bg-gradient-to-b from-background to-secondary/20">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <Sparkles className="mx-auto h-8 w-8 text-primary" aria-hidden />
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            O PCA 2027 começa em meses. Seu órgão tá pronto?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Configure em 3 minutos. Primeira campanha PCA pronta em até 1 hora.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/cadastro"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Começar grátis <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} LicitaGram · Equipe Licitagram</p>
          <div className="flex gap-4">
            <a href="https://licitagram.com" className="hover:text-foreground">
              LicitaGram B2B
            </a>
            <a href="mailto:contato@licitagram.com" className="hover:text-foreground">
              contato@licitagram.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function PriceCard({
  name,
  price,
  tag,
  features,
  cta,
  ctaHref,
  highlighted,
}: {
  name: string
  price: string
  tag: string
  features: string[]
  cta: string
  ctaHref?: string
  highlighted?: boolean
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl border p-6 ${
        highlighted ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-primary">{tag}</p>
      <h3 className="mt-2 text-xl font-semibold">{name}</h3>
      <p className="mt-1 font-mono text-2xl font-semibold">{price}</p>
      <ul className="mt-6 flex-1 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref ?? '/cadastro'}
        className={`mt-6 inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium ${
          highlighted
            ? 'bg-primary text-primary-foreground hover:opacity-90'
            : 'border border-border bg-background hover:bg-secondary'
        }`}
      >
        {cta} <ArrowRight className="ml-2 h-4 w-4" />
      </Link>
    </div>
  )
}
