import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

// Reverse lookup: SEO slug → search query
const SLUG_MAP: Record<string, { label: string; query: string; hint: string }> = {
  'locacao-gerador': { label: 'Locação de gerador', query: 'locação de gerador', hint: 'Diárias, fornecimento continuo e emergencial' },
  'material-escritorio': { label: 'Material de escritório', query: 'material de escritório', hint: 'Papel, canetas, suprimentos gerais' },
  'uniformes': { label: 'Uniformes', query: 'uniforme', hint: 'EPIs, fardamentos, vestimenta profissional' },
  'manutencao-predial': { label: 'Manutenção predial', query: 'manutenção predial', hint: 'Elétrica, hidráulica, conservação' },
  'servico-limpeza': { label: 'Serviço de limpeza', query: 'serviço limpeza conservação', hint: 'Terceirização, insumos, equipamentos' },
  'combustivel': { label: 'Combustível', query: 'combustível', hint: 'Diesel, gasolina, etanol, fornecimento' },
  'medicamentos': { label: 'Medicamentos', query: 'medicamento', hint: 'Genéricos, referência, oncológicos' },
  'equipamento-medico': { label: 'Equipamento médico', query: 'equipamento médico hospitalar', hint: 'Diagnóstico, UTI, cirúrgico' },
  'veiculos': { label: 'Veículos', query: 'veículo aquisição', hint: 'Carros oficiais, ambulâncias, caminhões' },
  'software': { label: 'Software', query: 'software licença', hint: 'Licenciamento, desenvolvimento, SaaS' },
  'consultoria': { label: 'Consultoria', query: 'consultoria técnica', hint: 'Especializada, jurídica, gestão' },
  'obras-civis': { label: 'Obras civis', query: 'obras construção civil', hint: 'Construção, reforma, ampliação' },
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return Object.keys(SLUG_MAP).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const info = SLUG_MAP[slug]
  if (!info) return { title: 'Categoria não encontrada' }

  return {
    title: `Preço de ${info.label} em Licitações — Licitagram`,
    description: `Quanto o governo paga por ${info.label.toLowerCase()} em licitações públicas? Dados reais do PNCP, Painel de Preços e BPS Saúde consolidados.`,
    keywords: [
      `preço ${info.label.toLowerCase()}`,
      `${info.label.toLowerCase()} licitação`,
      `${info.label.toLowerCase()} pregão`,
      `histórico ${info.label.toLowerCase()} PNCP`,
      `tabela preço ${info.label.toLowerCase()} governo`,
    ],
    alternates: { canonical: `https://licitagram.com/precos/${slug}` },
    openGraph: {
      title: `Preços de ${info.label} em licitações públicas`,
      description: `Consulta pública e gratuita de preços reais praticados`,
      type: 'website',
      locale: 'pt_BR',
    },
  }
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

interface StatsResult {
  count: number
  median: number | null
  p25: number | null
  p75: number | null
  min: number | null
  max: number | null
  samples: Array<{ objeto: string; valor: number; uf: string | null; orgao: string | null; data: string | null }>
}

async function fetchStats(query: string): Promise<StatsResult> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('tenders')
    .select('objeto, uf, orgao_nome, valor_homologado, data_encerramento')
    .textSearch('objeto', query, { type: 'websearch', config: 'portuguese' })
    .not('valor_homologado', 'is', null)
    .order('data_encerramento', { ascending: false })
    .limit(200)

  if (error || !data || data.length === 0) {
    return { count: 0, median: null, p25: null, p75: null, min: null, max: null, samples: [] }
  }

  const values = data
    .map((r) => (r.valor_homologado as number | null))
    .filter((v): v is number => typeof v === 'number' && v > 0)
    .sort((a, b) => a - b)

  const percentile = (p: number) => {
    if (values.length === 0) return null
    const idx = Math.floor((values.length - 1) * p)
    return values[idx]
  }

  const samples = data.slice(0, 5).map((r) => ({
    objeto: String(r.objeto ?? '').slice(0, 80),
    valor: (r.valor_homologado as number | null) ?? 0,
    uf: (r.uf as string | null) ?? null,
    orgao: (r.orgao_nome as string | null)?.slice(0, 60) ?? null,
    data: (r.data_encerramento as string | null) ?? null,
  }))

  return {
    count: values.length,
    median: percentile(0.5),
    p25: percentile(0.25),
    p75: percentile(0.75),
    min: values[0],
    max: values[values.length - 1],
    samples,
  }
}

function formatBRL(v: number | null): string {
  if (v === null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export default async function PrecoSlugPage({ params }: Props) {
  const { slug } = await params
  const info = SLUG_MAP[slug]
  if (!info) notFound()

  const stats = await fetchStats(info.query)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-foreground tracking-tight">
            Licitagram
          </Link>
          <nav className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/precos" className="hover:text-foreground transition-colors">← Todas categorias</Link>
            <Link href="/login" className="text-foreground">Entrar →</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand mb-2">
            Preços de mercado · consulta pública
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            Preço de {info.label} em licitações
          </h1>
          <p className="text-base text-muted-foreground mt-3 max-w-2xl">
            {info.hint}. Dados reais de {stats.count > 0 ? `${stats.count.toLocaleString('pt-BR')} pregões homologados` : 'pregões homologados'} nos últimos meses.
          </p>
        </div>

        {stats.count === 0 ? (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Sem dados consolidados para esta categoria ainda. Use a{' '}
              <Link href="/precos" className="text-brand underline">busca completa</Link>{' '}
              com termos mais específicos.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Mediana</p>
                <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">
                  {formatBRL(stats.median)}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">P25</p>
                <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">
                  {formatBRL(stats.p25)}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">P75</p>
                <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">
                  {formatBRL(stats.p75)}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Mínimo</p>
                <p className="text-xl font-semibold font-mono tabular-nums tracking-tight text-emerald-400">
                  {formatBRL(stats.min)}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Máximo</p>
                <p className="text-xl font-semibold font-mono tabular-nums tracking-tight text-red-400">
                  {formatBRL(stats.max)}
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Amostra dos últimos pregões homologados
                </p>
              </div>
              <div className="divide-y divide-border">
                {stats.samples.map((s, i) => (
                  <div key={i} className="p-4 hover:bg-muted/30 transition-colors">
                    <p className="text-sm text-foreground font-medium line-clamp-1">{s.objeto}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">{s.orgao ?? '—'}</span>
                      {s.uf && <span className="text-[11px] font-mono text-muted-foreground">{s.uf}</span>}
                      {s.data && (
                        <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                          {new Date(s.data).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      <span className="ml-auto text-sm font-semibold font-mono tabular-nums text-foreground">
                        {formatBRL(s.valor)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="mt-12 bg-card border border-brand/30 rounded-xl p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand mb-2">
            Plano pago tem muito mais
          </p>
          <h3 className="text-xl font-semibold text-foreground mb-3">
            Filtros por UF, órgão, modalidade · Exportação CSV · Benchmark por concorrente
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Com Licitagram completo você também tem: Forensic Replay, matching IA, robô de lances,
            compliance automático e monitor de chat em tempo real. 14 dias grátis.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-brand text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            Testar grátis →
          </Link>
        </div>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-foreground mb-4">Como ler estes preços</h2>
          <p className="text-sm text-muted-foreground mb-3">
            A <strong className="text-foreground">mediana</strong> é o preço típico — metade dos pregões
            foi homologada acima, metade abaixo. Use como baseline.
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            Os <strong className="text-foreground">percentis P25 e P75</strong> mostram a faixa onde a
            maioria dos pregões se concentra. Fora dessa faixa são outliers (possivelmente edital
            com requisitos atípicos).
          </p>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Mínimo e máximo</strong> ajudam a identificar: quando o
            mínimo é muito baixo, há fornecedores agressivos nesse mercado. Quando o máximo é muito
            alto, há editais premium para especificações restritivas.
          </p>
        </section>
      </main>

      <footer className="border-t border-border mt-20">
        <div className="max-w-5xl mx-auto px-6 py-8 text-xs text-muted-foreground flex items-center justify-between">
          <p>© 2026 Licitagram</p>
          <div className="flex gap-4">
            <Link href="/blog" className="hover:text-foreground">Blog</Link>
            <Link href="/precos" className="hover:text-foreground">Preços</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
