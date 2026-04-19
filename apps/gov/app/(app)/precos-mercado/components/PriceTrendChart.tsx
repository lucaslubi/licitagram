'use client'

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PrecoTrendPoint } from '@/lib/precos/pncp-engine'

interface Props {
  points: PrecoTrendPoint[]
  medianGlobal?: number
}

function formatBRL(value: unknown): string {
  const n = Number(value ?? 0)
  if (n >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

function formatMonthLabel(mes: unknown): string {
  const s = typeof mes === 'string' ? mes : String(mes ?? '')
  const [y, m] = s.split('-').map(Number)
  if (!y || !m) return s
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

export function PriceTrendChart({ points, medianGlobal }: Props) {
  if (points.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Dados insuficientes para tendência (mín. 2 meses)
      </div>
    )
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
          <defs>
            <linearGradient id="rangeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={formatMonthLabel}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            stroke="hsl(var(--border))"
          />
          <YAxis
            tickFormatter={formatBRL}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            stroke="hsl(var(--border))"
            width={64}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={formatMonthLabel}
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                mediana: 'Mediana',
                media: 'Média',
                maximo: 'Máximo',
                minimo: 'Mínimo',
                n: 'Contratações',
              }
              const n = Number(value ?? 0)
              const key = String(name)
              if (key === 'n') return [n, labels[key]]
              return [
                `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                labels[key] ?? key,
              ]
            }}
          />
          <Area
            type="monotone"
            dataKey="maximo"
            stroke="none"
            fill="url(#rangeGradient)"
            name="maximo"
            stackId="range"
          />
          <Line
            type="monotone"
            dataKey="mediana"
            stroke="hsl(217 91% 60%)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'hsl(217 91% 60%)' }}
            activeDot={{ r: 5 }}
            name="mediana"
          />
          <Line
            type="monotone"
            dataKey="media"
            stroke="hsl(142 71% 50%)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            name="media"
          />
          {medianGlobal && medianGlobal > 0 && (
            <ReferenceLine
              y={medianGlobal}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="2 6"
              label={{
                value: `Mediana global: ${formatBRL(medianGlobal)}`,
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 10,
                position: 'insideTopRight',
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-center gap-6 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-primary" />
          Mediana mensal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-accent" style={{ borderTop: '1.5px dashed currentColor', background: 'transparent' }} />
          Média mensal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-5 rounded-sm bg-primary/30" />
          Intervalo (min–max)
        </span>
      </div>
    </div>
  )
}
