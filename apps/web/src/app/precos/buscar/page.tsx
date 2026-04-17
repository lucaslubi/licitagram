import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ q?: string; uf?: string }>
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams
  const term = (q ?? '').trim()
  if (!term || term.length < 3) {
    return { title: 'Busca de Preços — Licitagram' }
  }
  return {
    title: `Preço de ${term} em licitações — Licitagram`,
    description: `Preço praticado em pregões públicos para "${term}". Dados reais consolidados de PNCP e outras fontes oficiais.`,
    alternates: { canonical: `https://licitagram.com/precos/buscar?q=${encodeURIComponent(term)}` },
  }
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

interface Stats {
  count: number
  median: number | null
  p25: number | null
  p75: number | null
  min: number | null
  max: number | null
  samples: Array<{ objeto: string; valor: number; uf: string | null; orgao: string | null; data: string | null }>
}

async function fetchStats(query: string): Promise<Stats> {
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
    .map((r) => r.valor_homologado as number | null)
    .filter((v): v is number => typeof v === 'number' && v > 0)
    .sort((a, b) => a - b)
  const pct = (p: number) => (values.length === 0 ? null : values[Math.floor((values.length - 1) * p)])
  return {
    count: values.length,
    median: pct(0.5),
    p25: pct(0.25),
    p75: pct(0.75),
    min: values[0],
    max: values[values.length - 1],
    samples: data.slice(0, 10).map((r) => ({
      objeto: String(r.objeto ?? '').slice(0, 100),
      valor: (r.valor_homologado as number | null) ?? 0,
      uf: (r.uf as string | null) ?? null,
      orgao: (r.orgao_nome as string | null)?.slice(0, 70) ?? null,
      data: (r.data_encerramento as string | null) ?? null,
    })),
  }
}

function fmt(v: number | null): string {
  if (v === null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export default async function BuscarPrecosPage({ searchParams }: Props) {
  const { q } = await searchParams
  const term = (q ?? '').trim()

  // Empty or too-short query → bounce to the landing page
  if (!term || term.length < 3) redirect('/precos')

  const stats = await fetchStats(term)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-foreground tracking-tight">Licitagram</Link>
          <nav className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/precos" className="hover:text-foreground transition-colors">← Nova busca</Link>
            <Link href="/login" className="text-foreground">Entrar →</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand mb-2">
            Resultado da busca
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            &ldquo;{term}&rdquo;
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {stats.count > 0
              ? `${stats.count.toLocaleString('pt-BR')} pregões homologados encontrados`
              : 'Nenhum pregão homologado encontrado. Tente termos mais específicos.'}
          </p>
        </div>

        <form action="/precos/buscar" method="get" className="mb-10">
          <div className="bg-card border border-border rounded-xl p-2 flex gap-2 max-w-2xl">
            <input
              name="q"
              defaultValue={term}
              placeholder="Ex: locação de gerador 250 kva"
              className="flex-1 bg-transparent text-foreground px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              minLength={3}
              required
            />
            <button
              type="submit"
              className="bg-brand text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-brand-dark transition-colors"
            >
              Buscar
            </button>
          </div>
        </form>

        {stats.count > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Mediana</p>
                <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">{fmt(stats.median)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">P25</p>
                <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">{fmt(stats.p25)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">P75</p>
                <p className="text-xl font-semibold text-foreground font-mono tabular-nums tracking-tight">{fmt(stats.p75)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Mínimo</p>
                <p className="text-xl font-semibold font-mono tabular-nums tracking-tight text-emerald-400">{fmt(stats.min)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">Máximo</p>
                <p className="text-xl font-semibold font-mono tabular-nums tracking-tight text-red-400">{fmt(stats.max)}</p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Pregões homologados mais recentes
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
                        {fmt(s.valor)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="mt-12 bg-card border border-brand/30 rounded-xl p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand mb-2">Plano pago desbloqueia</p>
          <h3 className="text-xl font-semibold text-foreground mb-3">
            Filtros por UF e órgão · Exportação CSV · Benchmark por concorrente
          </h3>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-brand text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            Testar grátis — 7 dias →
          </Link>
        </div>
      </main>
    </div>
  )
}
