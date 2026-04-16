'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AdicionarPregaoPage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [orgao, setOrgao] = useState('')
  const [numero, setNumero] = useState('')
  const [objeto, setObjeto] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function detectPortal(u: string): string | null {
    try {
      const host = new URL(u).hostname.toLowerCase()
      if (host.includes('comprasnet.gov.br') || host.includes('compras.gov.br') || host.includes('estaleiro.serpro')) return 'Compras.gov.br'
      if (host.includes('bll')) return 'BLL'
      if (host.includes('licitanet')) return 'Licitanet'
      if (host.includes('portaldecompraspublicas')) return 'PCP'
      return null
    } catch {
      return null
    }
  }

  const portalDetected = url.trim() ? detectPortal(url.trim()) : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!url.trim()) {
      setError('Cole a URL do pregão')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/pregao-chat/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portal_pregao_url: url.trim(),
          orgao_nome: orgao.trim() || undefined,
          numero_pregao: numero.trim() || undefined,
          objeto_resumido: objeto.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erro ao criar monitor')
        return
      }
      router.push('/pregoes')
    } catch {
      setError('Erro de conexão')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Monitorar pregão</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Cole a URL do pregão e comece a monitorar o chat do pregoeiro em tempo real
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <div>
            <Label htmlFor="url" className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              URL do pregão
            </Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/..."
              type="url"
              required
              className="mt-1.5"
              autoFocus
            />
            {portalDetected ? (
              <p className="text-xs text-emerald-500 mt-1.5 font-mono">
                ✓ Portal detectado: {portalDetected}
              </p>
            ) : url.trim() ? (
              <p className="text-xs text-destructive mt-1.5">
                Portal não reconhecido. Suportados: Compras.gov.br
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1.5">
                Copie da barra de endereço do navegador na sala do pregão
              </p>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Identificação (opcional)
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="orgao" className="text-xs text-muted-foreground">Órgão</Label>
              <Input
                id="orgao"
                value={orgao}
                onChange={(e) => setOrgao(e.target.value)}
                placeholder="Ex: Ministério da Saúde"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="numero" className="text-xs text-muted-foreground">Número</Label>
              <Input
                id="numero"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Ex: 10/2026"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="objeto" className="text-xs text-muted-foreground">Objeto</Label>
            <Input
              id="objeto"
              value={objeto}
              onChange={(e) => setObjeto(e.target.value)}
              placeholder="Ex: Aquisição de materiais de escritório"
              className="mt-1"
            />
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Preencher esses campos ajuda a identificar o pregão nos alertas. Se deixar em branco,
            o sistema tenta extrair automaticamente da página do portal.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={submitting || !portalDetected}>
            {submitting ? 'Iniciando…' : 'Começar monitoramento'}
          </Button>
          <Link href="/pregoes">
            <Button type="button" variant="ghost">Cancelar</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
