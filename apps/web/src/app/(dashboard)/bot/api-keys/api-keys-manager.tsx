'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface ApiKey {
  id: string
  name: string
  key_preview: string
  scopes: string[]
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

interface ListResp {
  keys: ApiKey[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function ApiKeysManager() {
  const { data, mutate, isLoading } = useSWR<ListResp>('/api/bot/api-keys', fetcher)

  const [name, setName] = useState('')
  const [writeScope, setWriteScope] = useState(false)
  const [justCreated, setJustCreated] = useState<{ plaintext: string; preview: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createKey() {
    setError(null)
    if (!name.trim() || name.trim().length < 3) {
      setError('Nome deve ter ao menos 3 caracteres')
      return
    }
    setBusy(true)
    try {
      const scopes = writeScope ? ['read', 'write'] : ['read']
      const res = await fetch('/api/bot/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scopes }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Erro ao criar chave')
        return
      }
      setJustCreated({ plaintext: body.plaintext, preview: body.key.key_preview })
      setName('')
      setWriteScope(false)
      await mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar chave')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revogar esta chave? Essa ação não pode ser desfeita.')) return
    setBusy(true)
    await fetch(`/api/bot/api-keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    await mutate()
    setBusy(false)
  }

  const active = (data?.keys ?? []).filter((k) => !k.revoked_at)
  const revoked = (data?.keys ?? []).filter((k) => !!k.revoked_at)

  return (
    <div className="space-y-4">
      {justCreated && (
        <div className="bg-card border border-emerald-500/30 rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-400 mb-2">
            Chave criada — guarde AGORA
          </p>
          <p className="text-sm text-foreground">
            Este token será mostrado apenas uma vez. Copie-o para o seu gerenciador de segredos.
          </p>
          <code className="block mt-3 bg-muted p-3 rounded-lg font-mono text-xs break-all text-foreground border border-border">
            {justCreated.plaintext}
          </code>
          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(justCreated.plaintext)}
            >
              Copiar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setJustCreated(null)}>
              Já guardei
            </Button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
          Criar nova chave
        </p>
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <Label htmlFor="name" className="text-xs text-muted-foreground">
              Nome (apenas para identificação)
            </Label>
            <Input
              id="name"
              placeholder="Ex: integração SAP produção"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={writeScope}
              onChange={(e) => setWriteScope(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Permitir gravação (POST/PATCH)
          </label>
          <Button disabled={busy} onClick={createKey}>
            Gerar chave
          </Button>
        </div>
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Chaves ativas
          </p>
        </div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
        ) : active.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Nenhuma chave ativa.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Nome</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Preview</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Escopos</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Último uso</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {active.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-2.5 font-medium text-foreground">{k.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{k.key_preview}••••</td>
                  <td className="px-4 py-2.5 space-x-1">
                    {k.scopes.map((s) => (
                      <Badge key={s} variant="secondary" className="text-[10px] uppercase tracking-wider">
                        {s}
                      </Badge>
                    ))}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono tabular-nums">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString('pt-BR') : 'nunca'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => revoke(k.id)} disabled={busy}>
                      Revogar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {revoked.length > 0 && (
        <details className="bg-card border border-border rounded-xl">
          <summary className="px-4 py-3 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
            Chaves revogadas ({revoked.length})
          </summary>
          <table className="w-full text-sm border-t border-border">
            <tbody className="divide-y divide-border">
              {revoked.map((k) => (
                <tr key={k.id} className="text-muted-foreground">
                  <td className="px-4 py-2.5 font-mono text-xs">{k.key_preview}••••</td>
                  <td className="px-4 py-2.5">{k.name}</td>
                  <td className="px-4 py-2.5 text-xs font-mono tabular-nums">
                    revogada em {k.revoked_at ? new Date(k.revoked_at).toLocaleString('pt-BR') : '?'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}
