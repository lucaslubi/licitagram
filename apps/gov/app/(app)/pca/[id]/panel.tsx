'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Clock, Copy, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { CampanhaSetorRow } from '@/lib/pca/queries'

interface Props {
  campanhaId: string
  initialSetores: CampanhaSetorRow[]
}

export function CampanhaPanel({ campanhaId, initialSetores }: Props) {
  const [setores, setSetores] = useState<CampanhaSetorRow[]>(initialSetores)

  // Supabase Realtime subscription on respostas_setor changes for THIS campanha.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`campanha:${campanhaId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'licitagov',
          table: 'respostas_setor',
          filter: `campanha_pca_id=eq.${campanhaId}`,
        },
        (payload) => {
          const next = payload.new as { id: string; respondido_em: string | null; revogado: boolean }
          setSetores((prev) =>
            prev.map((s) =>
              s.respostaId === next.id
                ? { ...s, respondidoEm: next.respondido_em, revogado: next.revogado }
                : s,
            ),
          )
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [campanhaId])

  const copyLink = (_respostaId: string, setorNome: string) => {
    // The full token is never returned to the browser (only the hash is in DB).
    // For copy-link UX we need a separate flow: the wizard shows tokens once at
    // creation. Here, offer to regenerate via admin tool (Phase 3B).
    toast.info(`Link do setor "${setorNome}" é enviado por email. Para regenerar, contate o admin.`)
  }

  if (setores.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nenhum setor na campanha.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {setores.map((s) => (
        <li key={s.respostaId} className="flex items-center gap-3 p-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              s.revogado
                ? 'bg-destructive/10 text-destructive'
                : s.respondidoEm
                  ? 'bg-accent/10 text-accent'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {s.revogado ? (
              <ShieldAlert className="h-4 w-4" aria-hidden />
            ) : s.respondidoEm ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            ) : (
              <Clock className="h-4 w-4" aria-hidden />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {s.setorNome}
              {s.setorSigla ? <span className="ml-2 text-xs text-muted-foreground">({s.setorSigla})</span> : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {s.revogado
                ? 'Token revogado'
                : s.respondidoEm
                  ? `Respondido em ${new Date(s.respondidoEm).toLocaleString('pt-BR')} · ${s.itensCount} itens`
                  : `Aguardando · expira em ${new Date(s.expiraEm).toLocaleDateString('pt-BR')}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => copyLink(s.respostaId, s.setorNome)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            title="Sobre o link"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden /> Link
          </button>
        </li>
      ))}
    </ul>
  )
}
