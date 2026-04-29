import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  GanttChartSquare,
  Gavel,
  Mail,
  ScanSearch,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { Logo } from '@/components/app/Logo'

const ARTIFACTS = [
  {
    icon: ClipboardList,
    label: 'PCA Collector',
    detail:
      'Coleta demandas dos setores via link único mobile-first e consolida automaticamente com IA, eliminando planilhas paralelas.',
    cite: 'IN SEGES/ME 40/2020',
  },
  {
    icon: FileCheck2,
    label: 'DFD + ETP',
    detail:
      'Documento de Formalização de Demanda e Estudo Técnico Preliminar (13 incisos) redigidos com citação dispositivo-a-dispositivo.',
    cite: 'Lei 14.133/2021, art. 12 VII e art. 18',
  },
  {
    icon: Scale,
    label: 'Mapa de Riscos',
    detail:
      'Matriz 3×3 de probabilidade × impacto com tratamento, mitigação e responsáveis. Obrigatório em grande vulto.',
    cite: 'Lei 14.133/2021, art. 22',
  },
  {
    icon: TrendingUp,
    label: 'Cesta de Preços',
    detail:
      'Pesquisa automática no PNCP e fornecedores diretos. Mínimo 3 fontes, CV < 25%, método da mediana quando indicado.',
    cite: 'Acórdão TCU 1.875/2021',
  },
  {
    icon: GanttChartSquare,
    label: 'TR + Edital + Parecer',
    detail:
      'Termo de Referência (10 alíneas), Edital completo e Parecer jurídico — cada seção com citação legal rastreável.',
    cite: 'Art. 6º XXIII, art. 25, art. 53',
  },
  {
    icon: ScanSearch,
    label: 'Compliance Engine',
    detail:
      'Motor determinístico (não-IA) verifica presença de artefatos, riscos, cesta de preços e bloqueia publicação se houver pendência crítica.',
    cite: 'Citações TCU automáticas',
  },
]

const STEPS = [
  {
    n: '01',
    title: 'Cadastro por CNPJ',
    detail: 'Em 3 minutos. Buscamos dados na Receita Federal — você só confirma.',
  },
  {
    n: '02',
    title: 'Colete PCA ou crie processo',
    detail: 'Setores respondem via link mobile. Ou abra direto um processo de licitação.',
  },
  {
    n: '03',
    title: 'IA redige artefatos',
    detail: 'DFD, ETP, Riscos, Preços, TR, Edital, Parecer — todos com citações legais.',
  },
  {
    n: '04',
    title: 'Compliance + publica',
    detail: 'Engine libera ou bloqueia. Publicação PNCP com audit trail completo.',
  },
]

const PILLARS = [
  {
    icon: ShieldCheck,
    label: 'Auditável por padrão',
    detail: 'Cada ato registrado em audit log imutável. LGPD art. 18 II e VI nativos.',
  },
  {
    icon: Gavel,
    label: 'Lei 14.133 em cada parágrafo',
    detail: 'Nenhum texto gerado sem citação dispositivo-a-dispositivo. Trilha legal rastreável.',
  },
  {
    icon: BookOpen,
    label: 'Jurisprudência TCU viva',
    detail: 'Regras atualizadas conforme acórdãos TCU mais relevantes pra fase interna.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Top nav */}
      <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="container-fluid flex h-16 items-center justify-between">
          <Link href="/" className="inline-flex items-center">
            <Logo size="md" />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/ajuda"
              className="hidden px-3 text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              Ajuda
            </Link>
            <Link
              href="/login"
              className="hidden h-9 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-brand px-4 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:brightness-110"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute left-[15%] top-[-10%] h-[520px] w-[520px] rounded-full bg-primary/15 blur-[130px]" />
          <div className="absolute right-[10%] top-[20%] h-[420px] w-[420px] rounded-full bg-accent/10 blur-[140px]" />
          <div
            className="absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
              backgroundSize: '64px 64px',
              maskImage: 'radial-gradient(ellipse at top, black 15%, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse at top, black 15%, transparent 75%)',
            }}
          />
        </div>

        <div className="container-fluid relative z-10 py-24 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="hero-tag mx-auto">
              <span className="hero-tag-dot" />
              Lei 14.133/2021 · Compliance TCU determinístico
            </div>

            <h1 className="mt-8 text-display-lg font-light-display text-balance text-foreground">
              A fase interna da licitação,{' '}
              <span className="text-gradient-brand">do DFD ao Edital</span>, em horas.
            </h1>
            <p className="mt-6 text-pretty text-body-lg leading-relaxed text-muted-foreground">
              Copiloto agêntico pra órgãos públicos. Gera DFD, ETP, Mapa de Riscos, Cesta de Preços, TR, Edital e Parecer
              jurídico — cada parágrafo com citação legal rastreável. Compliance Engine determinístico bloqueia publicações
              inadequadas antes que virem problema no TCU.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/cadastro"
                className="btn-shimmer relative inline-flex h-12 items-center justify-center overflow-hidden rounded-lg bg-gradient-brand px-7 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:brightness-110"
              >
                Começar grátis <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="glass inline-flex h-12 items-center justify-center rounded-lg px-7 text-sm font-medium text-foreground transition-all hover:bg-white/10"
              >
                Já tenho conta
              </Link>
            </div>
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
              <span>Beta gratuito de lançamento</span>
              <span className="opacity-30">·</span>
              <span>Sem cartão de crédito</span>
              <span className="opacity-30">·</span>
              <span>SSO Gov.br em breve</span>
            </p>
          </div>

          {/* Before/after bar */}
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              kicker="Tempo atual"
              value="3–5 dias"
              detail="por artefato, planilha + e-mail + revisão"
              tone="neutral"
            />
            <StatCard
              kicker="Com LicitaGram Gov"
              value="< 4 h"
              detail="processo completo, DFD a Edital"
              tone="brand"
            />
            <StatCard
              kicker="Universo elegível"
              value="~30 mil"
              detail="órgãos públicos no Brasil (CNPJs)"
              tone="neutral"
            />
          </div>
        </div>
      </section>

      {/* Artifacts grid */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="hero-tag mx-auto">
              <span className="hero-tag-dot" />
              Artefatos
            </div>
            <h2 className="mt-5 text-heading-xl font-display text-balance text-foreground">
              Cada documento com citação jurídica rastreável
            </h2>
            <p className="mt-4 text-pretty text-body text-muted-foreground">
              Nada de PDF opaco. Cada parágrafo aponta o dispositivo legal ou acórdão TCU que o embasa — pronto pra revisão
              da procuradoria e defesa no controle interno.
            </p>
          </div>
          <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ARTIFACTS.map((f) => (
              <li key={f.label} className="card-refined transition-colors hover:border-border/80">
                <div className="card-refined-header">
                  <div className="card-refined-icon">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <span className="feature-pill">{f.cite}</span>
                </div>
                <h3 className="card-refined-title">{f.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pillars */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-3">
            {PILLARS.map((p, i) => {
              const toneClass = i === 0 ? 'intel-insight-ok intel-insight-icon-ok' : i === 1 ? 'intel-insight-info intel-insight-icon-info' : 'intel-insight-warn intel-insight-icon-warn'
              const [borderClass, iconClass] = toneClass.split(' ')
              return (
                <div key={p.label} className={`intel-insight-card ${borderClass}`}>
                  <div className={`intel-insight-icon ${iconClass}`}>
                    <p.icon className="h-5 w-5" />
                  </div>
                  <p className="intel-insight-label">Pilar</p>
                  <h3 className="intel-insight-headline">{p.label}</h3>
                  <p className="intel-insight-detail">{p.detail}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="hero-tag mx-auto">
              <span className="hero-tag-dot" />
              Fluxo
            </div>
            <h2 className="mt-5 text-heading-xl font-display text-balance text-foreground">
              Do cadastro à publicação no PNCP
            </h2>
          </div>
          <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="card-refined">
                <span className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  {s.n}
                </span>
                <h3 className="mt-3 card-refined-title">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Beta / pricing */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 py-24 sm:px-6">
          <div className="card-refined overflow-hidden">
            <div className="hero-ai-glow" aria-hidden />
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl">
                <div className="hero-tag">
                  <span className="hero-tag-dot" />
                  Beta de lançamento
                </div>
                <h2 className="mt-4 text-heading-lg font-display text-foreground">
                  Gratuito durante a fase beta
                </h2>
                <p className="mt-3 text-body text-muted-foreground">
                  Todos os órgãos cadastrados durante 2026 têm acesso completo sem custo. Quando o beta terminar, você
                  recebe aviso com 30 dias de antecedência e escolhe entre os planos empresariais — ou sai sem cobrança.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                  {[
                    'Processos ilimitados durante o beta',
                    'Usuários ilimitados por órgão',
                    'LicitaGram AI proprietária incluída',
                    'Compliance Engine + audit log completo',
                    'Publicação PNCP via API oficial',
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
                <Link
                  href="/cadastro"
                  className="btn-shimmer relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-brand-dark sm:w-auto"
                >
                  Cadastrar órgão <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <a
                  href="mailto:contato@licitagram.com?subject=LicitaGram%20Gov%20Enterprise"
                  className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-border bg-card px-6 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:w-auto"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Falar com time comercial
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[140px]" />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-large border border-border bg-card shadow-lg">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h2 className="mt-6 text-heading-xl font-display text-balance text-foreground">
            O PCA 2027 começa em meses. <br className="hidden sm:inline" />
            Seu órgão tá pronto?
          </h2>
          <p className="mt-4 text-body text-muted-foreground">
            Configure em 3 minutos. Primeira campanha PCA pronta em até 1 hora.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/cadastro"
              className="btn-shimmer relative inline-flex h-12 items-center justify-center overflow-hidden rounded-lg bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-brand-dark"
            >
              Começar grátis <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-caption text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size="sm" withWordmark={false} />
            <p>© {new Date().getFullYear()} LicitaGram · Equipe Licitagram</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link href="/ajuda" className="hover:text-foreground">
              Central de ajuda
            </Link>
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

function StatCard({
  kicker,
  value,
  detail,
  tone,
}: {
  kicker: string
  value: string
  detail: string
  tone: 'neutral' | 'brand'
}) {
  return (
    <div
      className={`rounded-large p-5 ${
        tone === 'brand' ? 'glass-strong border-primary/30' : 'glass'
      }`}
    >
      <p className="text-overline text-muted-foreground">{kicker}</p>
      <p
        className={`mt-2 font-mono text-3xl font-semibold tracking-tight tabular-nums ${
          tone === 'brand' ? 'text-gradient-brand' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-caption text-muted-foreground">{detail}</p>
    </div>
  )
}
