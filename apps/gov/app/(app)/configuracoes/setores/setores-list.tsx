'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, Loader2, Building } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createSetorAction, updateSetorAction, deleteSetorAction, type SetorRow } from '@/lib/setores/actions'

interface Props {
  setores: SetorRow[]
  canEdit: boolean
}

interface DraftState {
  id: string | null
  nome: string
  sigla: string
}

const EMPTY: DraftState = { id: null, nome: '', sigla: '' }

export function SetoresList({ setores, canEdit }: Props) {
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const openNew = () => setDraft({ ...EMPTY })
  const openEdit = (s: SetorRow) => setDraft({ id: s.id, nome: s.nome, sigla: s.sigla ?? '' })
  const close = () => setDraft(null)

  const save = () => {
    if (!draft) return
    startTransition(async () => {
      const res = draft.id
        ? await updateSetorAction(draft.id, { nome: draft.nome, sigla: draft.sigla || null })
        : await createSetorAction({ nome: draft.nome, sigla: draft.sigla || null })
      if (res.ok) {
        toast.success(draft.id ? 'Setor atualizado' : 'Setor criado')
        close()
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const remove = (s: SetorRow) => {
    if (!window.confirm(`Desativar "${s.nome}"? Campanhas antigas continuam visíveis.`)) return
    startTransition(async () => {
      const res = await deleteSetorAction(s.id)
      if (res.ok) {
        toast.success('Setor desativado')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> Novo setor
          </Button>
        </div>
      )}

      {setores.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {setores.map((s) => (
            <li key={s.id} className="flex items-center gap-3 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                <Building className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${s.ativo ? '' : 'text-muted-foreground line-through'}`}>
                  {s.nome}
                  {s.sigla ? <span className="ml-2 text-xs text-muted-foreground">({s.sigla})</span> : null}
                </p>
                {s.responsavelNome && (
                  <p className="text-xs text-muted-foreground">Responsável: {s.responsavelNome}</p>
                )}
              </div>
              {canEdit && s.ativo && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(s)}
                    aria-label="Desativar"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => (!open ? close() : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Editar setor' : 'Novo setor'}</DialogTitle>
            <DialogDescription>
              Use o nome que os servidores conhecem (ex: &ldquo;Compras&rdquo;, &ldquo;TI&rdquo;, &ldquo;Secretaria de Saúde&rdquo;).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={draft?.nome ?? ''}
                onChange={(e) => setDraft(draft ? { ...draft, nome: e.target.value } : null)}
                placeholder="Secretaria de Compras"
                disabled={pending}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sigla">Sigla (opcional)</Label>
              <Input
                id="sigla"
                value={draft?.sigla ?? ''}
                onChange={(e) => setDraft(draft ? { ...draft, sigla: e.target.value.toUpperCase() } : null)}
                placeholder="SEC"
                maxLength={20}
                disabled={pending}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={pending || !draft?.nome || draft.nome.length < 2}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
