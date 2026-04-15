'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Credential {
  id: string
  portal_slug: string
  cnpj_licitante: string
  status: string
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AdicionarPregaoPage() {
  const router = useRouter()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    credencial_id: '',
    portal_pregao_url: '',
    orgao_nome: '',
    numero_pregao: '',
    objeto_resumido: '',
  })

  // Load active credentials
  useEffect(() => {
    async function loadCredentials() {
      try {
        const res = await fetch('/api/pregao-chat/credentials')
        if (res.ok) {
          const data = await res.json()
          const active = (data.credentials as Credential[]).filter(c => c.status === 'ativo')
          setCredentials(active)
          if (active.length === 1) {
            setForm(prev => ({ ...prev, credencial_id: active[0].id }))
          }
        }
      } finally {
        setLoading(false)
      }
    }
    loadCredentials()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.credencial_id || !form.portal_pregao_url || !form.orgao_nome || !form.numero_pregao) {
      setError('Preencha todos os campos obrigatórios')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/pregao-chat/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
        return
      }

      router.push('/pregoes')
    } catch {
      setError('Erro de conexão com o servidor')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (credentials.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="text-4xl mb-4">🔑</div>
            <h3 className="text-lg font-semibold mb-2">Nenhuma credencial ativa</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Você precisa conectar e testar suas credenciais do portal antes de adicionar um pregão para monitoramento.
            </p>
            <Button onClick={() => router.push('/pregoes/conectar')}>
              Conectar Portal
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Adicionar Pregão</h1>
        <p className="text-muted-foreground">
          Cadastre um pregão para monitorar o chat do pregoeiro em tempo real
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do Pregão</CardTitle>
          <CardDescription>
            Informe os dados do pregão que deseja monitorar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Credential selector */}
            {credentials.length > 1 && (
              <div className="space-y-2">
                <Label>Credencial do Portal</Label>
                <select
                  value={form.credencial_id}
                  onChange={(e) => setForm({ ...form, credencial_id: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Selecione...</option>
                  {credentials.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.portal_slug === 'comprasgov' ? 'Compras.gov.br' : c.portal_slug} — CNPJ {c.cnpj_licitante}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="url">URL do Pregão no Portal *</Label>
              <Input
                id="url"
                value={form.portal_pregao_url}
                onChange={(e) => setForm({ ...form, portal_pregao_url: e.target.value })}
                placeholder="https://www.comprasnet.gov.br/..."
                type="url"
                required
              />
              <p className="text-xs text-muted-foreground">
                Cole a URL completa da sala do pregão no Compras.gov.br
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="orgao">Nome do Órgão *</Label>
              <Input
                id="orgao"
                value={form.orgao_nome}
                onChange={(e) => setForm({ ...form, orgao_nome: e.target.value })}
                placeholder="Ex: Ministério da Saúde"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="numero">Número do Pregão *</Label>
              <Input
                id="numero"
                value={form.numero_pregao}
                onChange={(e) => setForm({ ...form, numero_pregao: e.target.value })}
                placeholder="Ex: 10/2026"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="objeto">Objeto (opcional)</Label>
              <Input
                id="objeto"
                value={form.objeto_resumido}
                onChange={(e) => setForm({ ...form, objeto_resumido: e.target.value })}
                placeholder="Descrição resumida do objeto da licitação"
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => router.push('/pregoes')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Adicionando...' : 'Começar Monitoramento'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
