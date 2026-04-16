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
    <div className="space-y-6">
      {justCreated && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="font-semibold text-emerald-900">Chave criada — guarde AGORA</h3>
          <p className="text-sm text-emerald-800 mt-1">
            Este token será mostrado apenas uma vez. Copie-o para o seu gerenciador de segredos.
          </p>
          <code className="block mt-3 bg-white p-3 rounded font-mono text-xs break-all text-slate-900 border border-emerald-200">
            {justCreated.plaintext}
          </code>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => {
              navigator.clipboard.writeText(justCreated.plaintext)
            }}
          >
            Copiar
          </Button>
          <Button
            variant="ghost"
            className="mt-3 ml-2"
            onClick={() => setJustCreated(null)}
          >
            Já guardei
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-semibold mb-3">Criar nova chave</h2>
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <Label htmlFor="name">Nome (apenas para identificação)</Label>
            <Input
              id="name"
              placeholder="Ex: integração SAP produção"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={writeScope}
              onChange={(e) => setWriteScope(e.target.checked)}
            />
            Permitir gravação (POST/PATCH)
          </label>
          <Button disabled={busy} onClick={createKey}>
            Gerar chave
          </Button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 font-semibold">Chaves ativas</div>
        {isLoading ? (
          <div className="p-4 text-slate-600">Carregando…</div>
        ) : active.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhuma chave ativa.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2">Nome</th>
                <th className="text-left px-4 py-2">Preview</th>
                <th className="text-left px-4 py-2">Escopos</th>
                <th className="text-left px-4 py-2">Último uso</th>
                <th className="text-right px-4 py-2">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {active.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-2 font-medium text-slate-900">{k.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-700">{k.key_preview}••••</td>
                  <td className="px-4 py-2 space-x-1">
                    {k.scopes.map((s) => (
                      <Badge key={s} className="bg-slate-200 text-slate-800">{s}</Badge>
                    ))}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString('pt-BR') : 'nunca'}
                  </td>
                  <td className="px-4 py-2 text-right">
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
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="px-4 py-3 cursor-pointer text-slate-600">
            Chaves revogadas ({revoked.length})
          </summary>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {revoked.map((k) => (
                <tr key={k.id} className="text-slate-500">
                  <td className="px-4 py-2 font-mono text-xs">{k.key_preview}••••</td>
                  <td className="px-4 py-2">{k.name}</td>
                  <td className="px-4 py-2">
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
