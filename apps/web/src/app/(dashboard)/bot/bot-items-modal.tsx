'use client'

import { useCallback, useEffect, useState } from 'react'

export interface ItemConfig {
  numero: number
  piso: string // string no form, converte pra número no submit
  ativo: boolean
  descricao?: string
  valor_estimado?: number | null
  unidade_medida?: string | null
  quantidade?: number | null
  grupo_numero?: number
}

interface PreviewResponse {
  compra_id: string
  total_items: number
  items: Array<{
    numero: number
    descricao: string
    valor_estimado: number | null
    quantidade: number | null
    unidade_medida: string | null
    tipo: 'item' | 'grupo'
    grupo_numero?: number
  }>
}

interface Props {
  pregaoId: string
  initialConfig: ItemConfig[] | null
  onSave: (config: ItemConfig[]) => void
  onClose: () => void
}

function formatBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function BotItemsModal({ pregaoId, initialConfig, onSave, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ItemConfig[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pisoGlobalInput, setPisoGlobalInput] = useState('')

  const loadPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/bot/pregao-preview?pregao_id=${encodeURIComponent(pregaoId.trim())}`,
      )
      const data: PreviewResponse | { error: string; code?: string } = await res.json()
      if (!res.ok) {
        setError((data as { error: string }).error || `HTTP ${res.status}`)
        setItems([])
        return
      }
      const preview = data as PreviewResponse
      if (!preview.items || preview.items.length === 0) {
        setError(
          'Nenhum item em disputa foi encontrado agora. Os itens só aparecem depois que a disputa é aberta pelo pregoeiro. ' +
            'Se você está agendando com antecedência: feche este modal, preencha o "Piso" único na linha e o robô vai usar esse piso pra todos os itens quando a disputa abrir.',
        )
        setItems([])
        return
      }

      // Merge com initialConfig (se user já configurou antes)
      const configMap = new Map<number, ItemConfig>()
      for (const c of initialConfig || []) configMap.set(c.numero, c)

      setItems(
        preview.items.map((it) => {
          const prior = configMap.get(it.numero)
          return {
            numero: it.numero,
            piso: prior?.piso ?? '',
            ativo: prior?.ativo ?? true,
            descricao: it.descricao,
            valor_estimado: it.valor_estimado,
            quantidade: it.quantidade,
            unidade_medida: it.unidade_medida,
            grupo_numero: it.grupo_numero,
          }
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [pregaoId, initialConfig])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  const toggleAtivo = (numero: number) => {
    setItems((arr) => arr.map((i) => (i.numero === numero ? { ...i, ativo: !i.ativo } : i)))
  }

  const updatePiso = (numero: number, piso: string) => {
    setItems((arr) => arr.map((i) => (i.numero === numero ? { ...i, piso } : i)))
  }

  const applyGlobalPiso = () => {
    const piso = pisoGlobalInput.trim()
    if (!piso) return
    setItems((arr) => arr.map((i) => ({ ...i, piso: i.ativo ? piso : i.piso })))
  }

  const toggleAllActive = (value: boolean) => {
    setItems((arr) => arr.map((i) => ({ ...i, ativo: value })))
  }

  const save = () => {
    // Validação: todo item ativo precisa ter piso numérico
    const invalid: number[] = []
    for (const i of items) {
      if (!i.ativo) continue
      if (!i.piso || isNaN(Number(i.piso)) || Number(i.piso) < 0) {
        invalid.push(i.numero)
      }
    }
    if (invalid.length > 0) {
      setError(
        `Defina piso válido (R$ ≥ 0) para os itens ativos: ${invalid.slice(0, 10).join(', ')}${invalid.length > 10 ? '…' : ''}`,
      )
      return
    }
    setError(null)
    onSave(items)
  }

  const activeCount = items.filter((i) => i.ativo).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Configurar itens do pregão
            </h2>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {pregaoId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Buscando itens no Compras.gov.br…
            </div>
          ) : error && items.length === 0 ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">Erro</p>
              <p className="mt-1 text-xs text-destructive/90">{error}</p>
              <button
                type="button"
                onClick={loadPreview}
                className="mt-3 rounded border border-border bg-card px-3 py-1 text-xs hover:bg-secondary"
              >
                Tentar de novo
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Nenhum item encontrado.
            </div>
          ) : (
            <>
              {/* Ações globais */}
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/50 p-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Piso global:</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 1000,00"
                    value={pisoGlobalInput}
                    onChange={(e) => setPisoGlobalInput(e.target.value)}
                    className="w-28 rounded border border-border bg-background px-2 py-1 text-right font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={applyGlobalPiso}
                    className="rounded border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-secondary"
                  >
                    Aplicar a todos ativos
                  </button>
                </div>
                <div className="flex items-center gap-2 border-l border-border pl-3">
                  <button
                    type="button"
                    onClick={() => toggleAllActive(true)}
                    className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-secondary"
                  >
                    Ativar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAllActive(false)}
                    className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-secondary"
                  >
                    Desativar todos
                  </button>
                </div>
                <div className="ml-auto text-xs text-muted-foreground">
                  <span className="font-mono text-foreground">{activeCount}</span> de{' '}
                  <span className="font-mono">{items.length}</span> ativos
                </div>
              </div>

              {error && (
                <div className="mb-3 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              {/* Tabela de itens */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-card/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-center font-medium" style={{ width: 30 }}>
                        ✓
                      </th>
                      <th className="px-2 py-2 text-left font-medium">#</th>
                      <th className="px-2 py-2 text-left font-medium">Descrição</th>
                      <th className="px-2 py-2 text-right font-medium">Qtd</th>
                      <th className="px-2 py-2 text-right font-medium">Estimado</th>
                      <th className="px-2 py-2 text-right font-medium">Piso R$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr
                        key={it.numero}
                        className={`border-t border-border/60 ${!it.ativo ? 'opacity-40' : ''}`}
                      >
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={it.ativo}
                            onChange={() => toggleAtivo(it.numero)}
                            className="h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-2 py-2 font-mono text-[11px] tabular-nums">
                          {it.grupo_numero ? (
                            <span title={`Grupo ${it.grupo_numero}`}>
                              G{it.grupo_numero}/{it.numero}
                            </span>
                          ) : (
                            it.numero
                          )}
                        </td>
                        <td className="max-w-[280px] px-2 py-2">
                          <p className="truncate" title={it.descricao}>
                            {it.descricao}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                          {it.quantidade != null
                            ? Number(it.quantidade).toLocaleString('pt-BR')
                            : '—'}
                          {it.unidade_medida ? ` ${it.unidade_medida}` : ''}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                          {formatBRL(it.valor_estimado)}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.piso}
                            onChange={(e) => updatePiso(it.numero, e.target.value)}
                            disabled={!it.ativo}
                            placeholder="0,00"
                            className="w-24 rounded border border-border bg-background px-2 py-1 text-right font-mono text-[11px] disabled:opacity-40"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-muted-foreground">
                <p>
                  💡 <strong className="text-foreground">Piso global</strong> aplica o mesmo valor a todos os
                  itens ativos de uma vez (você pode ajustar cada um depois). Itens{' '}
                  <strong className="text-foreground">desativados</strong> não recebem lance do robô.
                </p>
                <p className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-amber-400/90">
                  ⚠️ <strong>Importante:</strong> se algum item novo aparecer durante a disputa e não estiver nesta
                  lista (caso raro), o robô vai <strong>ignorar</strong> ele. Se quiser que o robô opere em
                  TUDO (mesmo itens que surgirem depois), cancele esta configuração e use apenas o Piso único
                  da linha anterior.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-card/40 p-4">
          <p className="text-xs text-muted-foreground">
            Se fechar sem salvar, o robô usa piso único da tela anterior pra todos os itens.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={loading || items.length === 0}
              className="rounded-lg bg-brand px-4 py-2 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            >
              Salvar configuração
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
