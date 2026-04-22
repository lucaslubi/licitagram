'use client'

import { useState, useCallback, useRef } from 'react'
import { BotItemsModal, type ItemConfig } from './bot-items-modal'

/**
 * BotBulkScheduler — agenda múltiplas sessões de lance em um único form.
 *
 * Cada linha corresponde a UM pregão. Usuário preenche:
 *   - Portal (config_id já cadastrado)
 *   - Pregão (ID do portal, ex: 98957106000712025)
 *   - Data/hora da disputa (scheduled_at)
 *   - Piso de lance (min_price)
 *   - Modo (shadow / supervisor / auto_bid)
 *
 * Dois modos de entrada:
 *   1. Formulário editável — adicionar/remover linhas manualmente
 *   2. Upload CSV — arquivo com colunas config_id,pregao_id,scheduled_at,min_price,mode
 *
 * Submit → POST /api/bot/sessions/bulk → summary dialog.
 */

interface BotConfig {
  id: string
  portal: string
  username: string
  is_active: boolean
  has_cookies?: boolean
}

interface BulkRow {
  tempId: string
  config_id: string
  pregao_id: string
  scheduled_at: string // datetime-local format (YYYY-MM-DDTHH:mm)
  min_price: string
  mode: 'shadow' | 'supervisor' | 'auto_bid'
  /** Config por item (se user clicou em "Configurar itens"). Se null, usa min_price pra todos. */
  items?: ItemConfig[] | null
}

interface Props {
  configs: BotConfig[]
}

interface BulkResult {
  session_id: string | null
  pregao_id: string
  status: 'created' | 'deduped' | 'error'
  error: string | null
}

const PORTAL_LABEL: Record<string, string> = {
  comprasnet: 'Compras.gov.br',
  comprasgov: 'Compras.gov.br',
  licitacoes_e: 'Licitações-e',
  bll: 'BLL',
  pcp: 'PCP',
}

const MODE_HELP: Record<string, string> = {
  shadow: 'Observa sem lançar (pra testar estratégia)',
  supervisor: 'Configura piso — robô nativo do portal faz o lance',
  auto_bid: 'Licitagram lança diretamente, respeitando piso e intervalos',
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function emptyRow(defaultConfigId: string): BulkRow {
  return {
    tempId: makeId(),
    config_id: defaultConfigId,
    pregao_id: '',
    scheduled_at: '',
    min_price: '',
    mode: 'supervisor',
  }
}

/**
 * Parse CSV simples. Aceita header com qualquer ordem das colunas:
 *   config_id, pregao_id, scheduled_at, min_price, mode
 * Scheduled_at pode ser ISO completo (2026-04-22T14:00:00-03:00) ou
 * apenas "2026-04-22 14:00" (converte pra ISO local do browser).
 */
function parseCsv(text: string, defaultConfigId: string): BulkRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const header = lines[0]!.split(/[,;]/).map((h) => h.trim().toLowerCase())
  const idx = {
    config_id: header.indexOf('config_id'),
    pregao_id: header.indexOf('pregao_id'),
    scheduled_at: header.indexOf('scheduled_at'),
    min_price: header.indexOf('min_price'),
    mode: header.indexOf('mode'),
  }

  const rows: BulkRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(/[,;]/).map((c) => c.trim())
    let scheduled = idx.scheduled_at >= 0 ? cells[idx.scheduled_at] ?? '' : ''
    // Normalize "2026-04-22 14:00" → datetime-local "2026-04-22T14:00"
    if (scheduled && scheduled.includes(' ') && !scheduled.includes('T')) {
      scheduled = scheduled.replace(' ', 'T').slice(0, 16)
    } else if (scheduled) {
      // trim seconds/timezone pra caber em datetime-local
      scheduled = scheduled.slice(0, 16)
    }
    const mode = (idx.mode >= 0 ? cells[idx.mode] ?? '' : '').toLowerCase()
    rows.push({
      tempId: makeId(),
      config_id: (idx.config_id >= 0 ? cells[idx.config_id] : '') || defaultConfigId,
      pregao_id: idx.pregao_id >= 0 ? cells[idx.pregao_id] ?? '' : '',
      scheduled_at: scheduled,
      min_price: idx.min_price >= 0 ? cells[idx.min_price] ?? '' : '',
      mode: (['shadow', 'supervisor', 'auto_bid'].includes(mode) ? mode : 'supervisor') as BulkRow['mode'],
    })
  }
  return rows
}

export function BotBulkScheduler({ configs }: Props) {
  const activeConfigs = configs.filter((c) => c.is_active)
  const defaultConfigId = activeConfigs[0]?.id ?? ''

  const [rows, setRows] = useState<BulkRow[]>([emptyRow(defaultConfigId)])
  const [submitting, setSubmitting] = useState(false)
  const [itemsModalTempId, setItemsModalTempId] = useState<string | null>(null)
  const [result, setResult] = useState<null | {
    summary: { total: number; created: number; deduped: number; errors: number; scheduled: number; immediate: number }
    results: BulkResult[]
  }>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const updateRow = useCallback((tempId: string, patch: Partial<BulkRow>) => {
    setRows((r) => r.map((row) => (row.tempId === tempId ? { ...row, ...patch } : row)))
  }, [])

  const addRow = useCallback(() => {
    setRows((r) => [...r, emptyRow(defaultConfigId)])
  }, [defaultConfigId])

  const removeRow = useCallback((tempId: string) => {
    setRows((r) => (r.length > 1 ? r.filter((row) => row.tempId !== tempId) : r))
  }, [])

  const clearAll = useCallback(() => {
    setRows([emptyRow(defaultConfigId)])
    setResult(null)
    setError(null)
  }, [defaultConfigId])

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result ?? '')
        const parsed = parseCsv(text, defaultConfigId)
        if (parsed.length === 0) {
          setError('CSV vazio ou inválido. Esperado header: config_id, pregao_id, scheduled_at, min_price, mode')
          return
        }
        setRows(parsed)
        setError(null)
      }
      reader.readAsText(file)
      // Reset input pra permitir reupload do mesmo arquivo
      if (fileRef.current) fileRef.current.value = ''
    },
    [defaultConfigId],
  )

  const validateRow = (r: BulkRow): string | null => {
    if (!r.config_id) return 'Portal obrigatório'
    if (!r.pregao_id.trim()) return 'Pregão ID obrigatório'
    if (r.scheduled_at) {
      const dt = new Date(r.scheduled_at)
      if (isNaN(dt.getTime())) return 'Data inválida'
    }
    if (r.min_price && isNaN(Number(r.min_price))) return 'Piso deve ser numérico'
    return null
  }

  const submit = useCallback(async () => {
    setError(null)
    // Valida tudo client-side primeiro
    const invalid: { idx: number; reason: string }[] = []
    rows.forEach((r, idx) => {
      const v = validateRow(r)
      if (v) invalid.push({ idx: idx + 1, reason: v })
    })
    if (invalid.length > 0) {
      setError(`${invalid.length} linha(s) com erro: ${invalid.map((i) => `#${i.idx} (${i.reason})`).join(', ')}`)
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        sessions: rows.map((r) => ({
          config_id: r.config_id,
          pregao_id: r.pregao_id.trim(),
          scheduled_at: r.scheduled_at ? new Date(r.scheduled_at).toISOString() : undefined,
          min_price: r.min_price ? Number(r.min_price) : undefined,
          mode: r.mode,
          // Se o user configurou itens individualmente, envia também
          items: r.items && r.items.length > 0
            ? r.items.map((it) => ({
                numero: it.numero,
                piso: it.ativo && it.piso ? Number(it.piso) : null,
                ativo: it.ativo,
                descricao: it.descricao,
                valor_estimado: it.valor_estimado,
              }))
            : undefined,
          idempotency_key: `${r.config_id}:${r.pregao_id.trim()}:${r.scheduled_at || 'now'}:${r.min_price || '0'}:${r.mode}:${r.tempId}`,
        })),
      }
      const res = await fetch('/api/bot/sessions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
        return
      }
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setSubmitting(false)
    }
  }, [rows])

  if (activeConfigs.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
        <p className="font-medium text-amber-400">Nenhum portal configurado ainda.</p>
        <p className="mt-1 text-xs text-amber-400/70">
          Adicione pelo menos uma configuração de portal na aba{' '}
          <span className="font-semibold">Portais Configurados</span> antes de agendar lances.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header + ações */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Agendar lances em lote</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cadastre múltiplas licitações com horário de disputa. O robô dispara cada uma automaticamente no momento certo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="hidden"
            id="bulk-csv-input"
          />
          <label
            htmlFor="bulk-csv-input"
            className="cursor-pointer rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            Importar CSV
          </label>
          <button
            type="button"
            onClick={addRow}
            className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            + Linha
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg border border-border bg-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Limpar
          </button>
        </div>
      </div>

      {/* CSV hint */}
      <details className="rounded-lg border border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">Formato CSV esperado</summary>
        <div className="mt-2 space-y-1 font-mono text-[11px] leading-relaxed">
          <p>config_id,pregao_id,scheduled_at,min_price,mode</p>
          <p>a1b2c3...,98957106000712025,2026-04-22T14:00,450000,auto_bid</p>
          <p>a1b2c3...,12345678000902025,2026-04-23T09:30,120000,supervisor</p>
        </div>
        <p className="mt-2 text-[11px]">
          Separadores aceitos: <code>,</code> ou <code>;</code>. Se <code>config_id</code> vier vazio, usamos o
          primeiro portal ativo por padrão. <code>scheduled_at</code> pode ser ISO-8601 ou &quot;YYYY-MM-DD HH:mm&quot;.
        </p>
      </details>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Tabela editável */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="border-b border-border bg-card/50 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Portal</th>
              <th className="px-3 py-2 text-left font-medium">Pregão ID</th>
              <th className="px-3 py-2 text-left font-medium">Disputa em</th>
              <th className="px-3 py-2 text-right font-medium">Piso (R$)</th>
              <th className="px-3 py-2 text-left font-medium">Modo</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.tempId} className="border-b border-border/50 last:border-0 align-top">
                <td className="px-3 py-2 font-mono text-muted-foreground">{idx + 1}</td>
                <td className="px-3 py-2">
                  <select
                    value={row.config_id}
                    onChange={(e) => updateRow(row.tempId, { config_id: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                  >
                    <option value="">— selecione —</option>
                    {activeConfigs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {PORTAL_LABEL[c.portal] ?? c.portal} · {c.username}
                        {c.has_cookies ? '' : ' (sem login)'}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={row.pregao_id}
                    onChange={(e) => updateRow(row.tempId, { pregao_id: e.target.value })}
                    placeholder="98957106000712025"
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs tabular-nums focus:border-primary focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="datetime-local"
                    value={row.scheduled_at}
                    onChange={(e) => updateRow(row.tempId, { scheduled_at: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs tabular-nums focus:border-primary focus:outline-none"
                  />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">vazio = agora</p>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.min_price}
                    onChange={(e) => updateRow(row.tempId, { min_price: e.target.value })}
                    placeholder="0,00"
                    disabled={!!row.items && row.items.length > 0}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-primary focus:outline-none disabled:opacity-40"
                    title={row.items && row.items.length > 0 ? 'Piso por item configurado — este campo não é usado' : 'Piso único aplicado a todos os itens'}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!row.pregao_id.trim()) {
                        alert('Preencha o ID do pregão primeiro.')
                        return
                      }
                      setItemsModalTempId(row.tempId)
                    }}
                    className="mt-1 w-full rounded border border-border bg-card/40 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {row.items && row.items.length > 0
                      ? `📋 ${row.items.filter(i => i.ativo).length} itens`
                      : '⚙️ Configurar por item'}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={row.mode}
                    onChange={(e) => updateRow(row.tempId, { mode: e.target.value as BulkRow['mode'] })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                  >
                    <option value="shadow">Observar</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="auto_bid">Auto Lance</option>
                  </select>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{MODE_HELP[row.mode]}</p>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(row.tempId)}
                    disabled={rows.length === 1}
                    className="rounded px-2 py-1 text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                    title="Remover linha"
                    aria-label="Remover linha"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{rows.length}</span>{' '}
          {rows.length === 1 ? 'licitação' : 'licitações'} pronta{rows.length === 1 ? '' : 's'} pra agendar
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || rows.length === 0}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Agendando…' : `Agendar ${rows.length} em lote`}
        </button>
      </div>

      {/* Resultado */}
      {result && (() => {
        const allDeduped =
          result.summary.created === 0 &&
          result.summary.errors === 0 &&
          result.summary.deduped > 0
        const hasErrors = result.summary.errors > 0
        const success = result.summary.created > 0
        const borderColor = success
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : allDeduped
            ? 'border-amber-500/30 bg-amber-500/5'
            : hasErrors
              ? 'border-destructive/30 bg-destructive/5'
              : 'border-border bg-card'
        const titleColor = success
          ? 'text-emerald-400'
          : allDeduped
            ? 'text-amber-400'
            : 'text-destructive'

        return (
          <div className={`rounded-xl border p-4 ${borderColor}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className={`text-sm font-semibold ${titleColor}`}>
                  {success
                    ? `✅ ${result.summary.created} ${result.summary.created === 1 ? 'sessão criada' : 'sessões criadas'}`
                    : allDeduped
                      ? '⚠️ Nada foi criado — já existiam sessões iguais'
                      : '❌ Nenhuma sessão criada'}
                </p>

                {success && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {result.summary.scheduled > 0 &&
                      `${result.summary.scheduled} agendada${result.summary.scheduled > 1 ? 's' : ''}`}
                    {result.summary.scheduled > 0 && result.summary.immediate > 0 && ' · '}
                    {result.summary.immediate > 0 &&
                      `${result.summary.immediate} rodando agora`}
                    {result.summary.deduped > 0 &&
                      ` · ${result.summary.deduped} já existiam (ignoradas)`}
                  </p>
                )}

                {allDeduped && (
                  <div className="mt-2 space-y-1.5 text-xs text-amber-400/90">
                    <p>
                      Você já tinha <strong>{result.summary.deduped} sessão(ões)</strong> cadastrada(s)
                      com os mesmos dados (mesmo pregão, horário e piso).
                    </p>
                    <p className="text-muted-foreground">
                      O que você pode fazer:
                    </p>
                    <ul className="ml-4 space-y-0.5 text-[11px] text-muted-foreground">
                      <li>
                        • Ver elas na aba <strong className="text-foreground">Sessões Ativas</strong>
                      </li>
                      <li>
                        • Mudar o piso ou o horário aqui e tentar de novo — vira sessão nova
                      </li>
                      <li>
                        • Se quer substituir: cancele a sessão antiga primeiro em{' '}
                        <strong className="text-foreground">Sessões Ativas</strong>, depois cadastre aqui de novo
                      </li>
                    </ul>
                  </div>
                )}

                {hasErrors && !success && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {result.summary.errors} erro(s) — veja abaixo
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={clearAll}
                className="shrink-0 rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs font-medium hover:bg-secondary"
              >
                Novo lote
              </button>
            </div>

            {hasErrors && (
              <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 p-2">
                <p className="text-xs font-medium text-destructive">Erros por linha:</p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-destructive/90">
                  {result.results
                    .filter((r) => r.status === 'error')
                    .map((r, i) => (
                      <li key={i} className="font-mono">
                        {r.pregao_id}: {r.error}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )
      })()}

      {/* Modal: configurar itens individualmente */}
      {itemsModalTempId && (() => {
        const row = rows.find((r) => r.tempId === itemsModalTempId)
        if (!row) return null
        return (
          <BotItemsModal
            pregaoId={row.pregao_id}
            initialConfig={row.items ?? null}
            onClose={() => setItemsModalTempId(null)}
            onSave={(config) => {
              updateRow(row.tempId, { items: config })
              setItemsModalTempId(null)
            }}
          />
        )
      })()}
    </div>
  )
}
