'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { BadgeCheck, Building2, Calendar, ExternalLink, Loader2, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

interface PainelRow {
  id: string
  tipo_item: 'M' | 'S'
  codigo_item: string
  descricao: string
  orgao_nome: string | null
  uasg_nome: string | null
  modalidade: string | null
  data_homologacao: string | null
  valor_unitario: number
  fornecedor_nome: string | null
  fonte_url: string | null
}

interface PainelStats {
  n: number
  media: number
  mediana: number
  cv: number
  compliance_tcu_1875: boolean
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

export function PainelOficialWidget({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery)
  const [codigo, setCodigo] = useState('')
  const [results, setResults] = useState<PainelRow[]>([])
  const [stats, setStats] = useState<PainelStats | null>(null)
  const [loading, startLoad] = useTransition()

  const run = useCallback(() => {
    if (!codigo.trim() && query.trim().length < 3) return
    startLoad(async () => {
      const supabase = createClient()
      const [rowsRes, statsRes] = await Promise.all([
        supabase.rpc('buscar_preco_painel_oficial', {
          p_query: query.trim() || null,
          p_codigo: codigo.trim() || null,
          p_tipo: null,
          p_modalidade: null,
          p_meses: 24,
          p_limit: 100,
        }),
        supabase.rpc('stats_painel_oficial', {
          p_query: query.trim() || null,
          p_codigo: codigo.trim() || null,
          p_tipo: null,
          p_meses: 24,
        }),
      ])
      const rows = ((rowsRes.data ?? []) as unknown as PainelRow[]).map((r) => ({
        ...r,
        valor_unitario: Number(r.valor_unitario),
      }))
      setResults(rows)
      const s = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data
      setStats(s ? (s as unknown as PainelStats) : null)
    })
  }, [codigo, query])

  const sortedByDate = useMemo(
    () =>
      [...results].sort((a, b) => {
        const av = a.data_homologacao ? new Date(a.data_homologacao).getTime() : 0
        const bv = b.data_homologacao ? new Date(b.data_homologacao).getTime() : 0
        return bv - av
      }),
    [results],
  )

  return (
    <Card className="border-emerald-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BadgeCheck className="h-4 w-4 text-emerald-500" />
          Painel de Preços Oficial
          <span className="ml-2 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
            governo.br
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Fonte oficial Compras.gov.br — aceita CATMAT/CATSER específico. Use pra fundamentar estimativas com base autoritativa (Acórdão TCU 1.875/2021).
        </p>

        <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Descrição</label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
              placeholder="cabo elétrico, papel…"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">CATMAT/CATSER</label>
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
              placeholder="470419"
              className="font-mono"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={run} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </Button>
          </div>
        </div>

        {stats && stats.n > 0 && (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 sm:grid-cols-4">
            <KPI label="Amostra oficial" value={stats.n.toString()} />
            <KPI label="Mediana" value={formatBRL(stats.mediana)} accent />
            <KPI label="Média" value={formatBRL(stats.media)} />
            <KPI
              label="CV"
              value={`${stats.cv.toFixed(1)}%`}
              tone={stats.cv < 25 ? 'ok' : 'warn'}
            />
          </div>
        )}

        {results.length > 0 && (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-card text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-left">Órgão</th>
                  <th className="px-3 py-2 text-left">Fornecedor</th>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sortedByDate.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 align-top hover:bg-card/40">
                    <td className="min-w-[220px] px-3 py-2">
                      <p className="line-clamp-2">{r.descricao}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {r.tipo_item === 'M' ? 'CATMAT' : 'CATSER'} {r.codigo_item}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold">
                      {formatBRL(r.valor_unitario)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-start gap-1">
                        <Building2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                        <span className="line-clamp-2">{r.orgao_nome ?? r.uasg_nome ?? '—'}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.fornecedor_nome?.slice(0, 30) ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(r.data_homologacao)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {r.fonte_url && (
                        <a
                          href={r.fonte_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-emerald-500"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && results.length === 0 && !stats && (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Busque por descrição ou código CATMAT/CATSER. Painel sincroniza sob demanda
            — caso venha vazio, sync ainda não foi feito pro código solicitado.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function KPI({
  label,
  value,
  accent,
  tone = 'neutral',
}: {
  label: string
  value: string
  accent?: boolean
  tone?: 'ok' | 'warn' | 'neutral'
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`font-mono text-lg font-semibold ${
          accent ? 'text-emerald-500' : tone === 'ok' ? 'text-emerald-500' : tone === 'warn' ? 'text-amber-500' : ''
        }`}
      >
        {value}
      </p>
    </div>
  )
}
