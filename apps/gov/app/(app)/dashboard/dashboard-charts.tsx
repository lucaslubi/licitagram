'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { FASE_LABEL } from '@/lib/validations/processo'

interface ProcessoPoint {
  id: string
  faseAtual: string
  criadoEm: string
  artefatosCount: number
}

interface Props {
  processos: ProcessoPoint[]
}

/**
 * Paleta institucional — matching o tema editorial do gabinete.
 * Tons terrosos + dourado pra evocar gazeta oficial, não dashboard SaaS.
 */
const FASE_COLOR: Record<string, string> = {
  rascunho: 'hsl(34 40% 72%)', // pergaminho
  dfd: 'hsl(28 55% 58%)', // terracota claro
  etp: 'hsl(25 62% 48%)', // terracota
  riscos: 'hsl(18 68% 42%)', // telha
  pesquisa: 'hsl(42 72% 50%)', // dourado mostarda
  termo_referencia: 'hsl(35 58% 40%)', // âmbar escuro
  edital: 'hsl(30 48% 32%)', // marrom café
  parecer: 'hsl(355 58% 44%)', // vermelho oxidado
  compliance: 'hsl(260 28% 55%)', // violeta ametista
  publicar: 'hsl(142 38% 42%)', // verde oliva
  publicado: 'hsl(145 55% 32%)', // verde musgo profundo
  cancelado: 'hsl(0 0% 50%)', // cinza neutro
}

function formatMonthShort(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  if (!y || !m) return mes
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
}

/**
 * Timeline de processos criados nos últimos 6 meses.
 * Área suave com gradiente — mais elegante que barras stacked.
 */
function ProcessosPorMes({ processos }: Props) {
  const data = useMemo(() => {
    const now = new Date()
    const buckets: Record<string, number> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets[key] = 0
    }
    for (const p of processos) {
      const d = new Date(p.criadoEm)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (key in buckets) buckets[key]! += 1
    }
    return Object.entries(buckets).map(([mes, total]) => ({
      mes,
      total,
    }))
  }, [processos])

  const totalHistorico = data.reduce((s, p) => s + p.total, 0)
  const media = totalHistorico / Math.max(1, data.length)

  if (totalHistorico === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
        Sem processos criados nos últimos 6 meses
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="label-institutional">Fluxo de processos</p>
          <p className="mt-1 font-display text-3xl font-medium leading-none tracking-tight tabular-nums">
            {totalHistorico}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            últimos 6 meses · média{' '}
            <span className="font-mono text-foreground">{media.toFixed(1)}</span>/mês
          </p>
        </div>
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="processoFlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(25 62% 48%)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="hsl(25 62% 48%)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="mes"
              tickFormatter={formatMonthShort}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              interval={0}
            />
            <YAxis hide />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '2 4' }}
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 6,
                fontSize: 11,
                padding: '6px 10px',
              }}
              labelFormatter={(mes) => formatMonthShort(String(mes))}
              formatter={(v) => [v, 'Processos']}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="hsl(25 62% 48%)"
              strokeWidth={2}
              fill="url(#processoFlow)"
              dot={{ r: 3, fill: 'hsl(25 62% 48%)', strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Donut chart — distribuição atual por fase.
 * Renderiza só fases com >0 processos, label externo.
 */
function DistribuicaoPorFase({ processos }: Props) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of processos) {
      counts[p.faseAtual] = (counts[p.faseAtual] ?? 0) + 1
    }
    return Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([fase, value]) => ({
        name: FASE_LABEL[fase] ?? fase,
        fase,
        value,
      }))
      .sort((a, b) => b.value - a.value)
  }, [processos])

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        Nenhum processo para distribuir
      </div>
    )
  }

  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="space-y-3">
      <div>
        <p className="label-institutional">Por fase</p>
        <p className="mt-1 font-display text-3xl font-medium leading-none tracking-tight tabular-nums">
          {total}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.length} {data.length === 1 ? 'fase ativa' : 'fases ativas'}
        </p>
      </div>
      <div className="relative h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={68}
              paddingAngle={2}
              dataKey="value"
              stroke="hsl(var(--background))"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.fase} fill={FASE_COLOR[d.fase] ?? 'hsl(var(--primary))'} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 6,
                fontSize: 11,
                padding: '6px 10px',
              }}
              formatter={(v, _n, item) => {
                const num = Number(v ?? 0)
                return [
                  `${num} (${((num / total) * 100).toFixed(0)}%)`,
                  (item as unknown as { name: string }).name,
                ]
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xl font-medium tabular-nums text-foreground">
            {data[0]!.value}
          </span>
          <span className="mt-0.5 max-w-[96px] truncate text-[9px] uppercase tracking-wider text-muted-foreground">
            {data[0]!.name}
          </span>
        </div>
      </div>
      <ul className="space-y-1 text-xs">
        {data.slice(0, 5).map((d) => (
          <li key={d.fase} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="block h-2 w-2 shrink-0 rounded-sm"
                style={{ background: FASE_COLOR[d.fase] ?? 'hsl(var(--primary))' }}
                aria-hidden
              />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {d.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Barra horizontal de produtividade — artefatos gerados por processo.
 * Mostra os top 5 processos com mais artefatos (indica onde o trabalho
 * está concentrado — útil pra gerente saber quem está puxando carga).
 */
function ProdutividadeArtefatos({ processos }: Props) {
  const data = useMemo(() => {
    return [...processos]
      .filter((p) => p.artefatosCount > 0)
      .sort((a, b) => b.artefatosCount - a.artefatosCount)
      .slice(0, 5)
      .map((p, idx) => ({
        ordem: idx + 1,
        artefatos: p.artefatosCount,
        id: p.id.slice(0, 8),
      }))
  }, [processos])

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        Nenhum artefato gerado ainda
      </div>
    )
  }

  const total = processos.reduce((s, p) => s + p.artefatosCount, 0)
  const media = total / Math.max(1, processos.filter((p) => p.artefatosCount > 0).length)

  return (
    <div className="space-y-3">
      <div>
        <p className="label-institutional">Artefatos gerados</p>
        <p className="mt-1 font-display text-3xl font-medium leading-none tracking-tight tabular-nums">
          {total}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          top 5 processos · média{' '}
          <span className="font-mono text-foreground">{media.toFixed(1)}</span>/processo
        </p>
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
            barCategoryGap={4}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="ordem"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={24}
              tickFormatter={(v) => `#${v}`}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 6,
                fontSize: 11,
                padding: '6px 10px',
              }}
              formatter={(v) => [v, 'Artefatos']}
              labelFormatter={(o) => `Processo #${o}`}
            />
            <Bar
              dataKey="artefatos"
              radius={[0, 4, 4, 0]}
              fill="hsl(42 72% 50%)"
              background={{ fill: 'hsl(var(--muted) / 0.4)', radius: 4 }}
              label={{
                position: 'right',
                fill: 'hsl(var(--foreground))',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Grid de 3 gráficos institucionais — composição editorial, sem cards
 * com sombra. Divisores verticais finos no estilo jornal.
 */
export function DashboardCharts({ processos }: Props) {
  return (
    <section className="grid gap-0 border-y border-border md:grid-cols-3">
      <div className="p-6">
        <ProcessosPorMes processos={processos} />
      </div>
      <div className="border-t border-border p-6 md:border-l md:border-t-0">
        <DistribuicaoPorFase processos={processos} />
      </div>
      <div className="border-t border-border p-6 md:border-l md:border-t-0">
        <ProdutividadeArtefatos processos={processos} />
      </div>
    </section>
  )
}
