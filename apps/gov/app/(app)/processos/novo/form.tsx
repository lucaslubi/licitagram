'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProcessoAction } from '@/lib/processos/actions'
import { TIPO_LABEL, MODALIDADE_LABEL } from '@/lib/validations/processo'

interface SetorOption {
  id: string
  nome: string
}

export function NovoProcessoForm({ setores }: { setores: SetorOption[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [objeto, setObjeto] = useState('')
  const [tipo, setTipo] = useState<keyof typeof TIPO_LABEL>('material')
  const [modalidade, setModalidade] = useState<keyof typeof MODALIDADE_LABEL | ''>('')
  const [setorId, setSetorId] = useState('')
  const [valor, setValor] = useState('')

  const submit = () => {
    startTransition(async () => {
      const res = await createProcessoAction({
        objeto,
        tipo,
        modalidade: (modalidade || null) as keyof typeof MODALIDADE_LABEL | null,
        setorRequisitanteId: setorId || null,
        valorEstimado: valor ? Number(valor) : null,
        campanhaPcaId: null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Processo criado')
      router.push(`/processos/${res.processoId}`)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          O que você quer contratar?
        </CardTitle>
        <CardDescription>
          Um texto livre. A IA classifica, sugere modalidade e inicia a fase interna.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="objeto">Objeto</Label>
          <textarea
            id="objeto"
            value={objeto}
            onChange={(e) => setObjeto(e.target.value)}
            disabled={pending}
            rows={3}
            placeholder="Ex: Aquisição de 5000 resmas de papel A4 75g/m² para uso administrativo geral durante o exercício 2027"
            className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            Quanto mais específico (quantidade, especificação técnica, prazo), melhor fica o DFD e o ETP.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tipo">Tipo</Label>
            <select
              id="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as typeof tipo)}
              disabled={pending}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {Object.entries(TIPO_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modalidade">Modalidade (opcional)</Label>
            <select
              id="modalidade"
              value={modalidade}
              onChange={(e) => setModalidade(e.target.value as typeof modalidade)}
              disabled={pending}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— IA sugere —</option>
              {Object.entries(MODALIDADE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="setor">Setor requisitante</Label>
            <select
              id="setor"
              value={setorId}
              onChange={(e) => setSetorId(e.target.value)}
              disabled={pending || setores.length === 0}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="">— não definido —</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="valor">Valor estimado (R$, opcional)</Label>
            <Input
              id="valor"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={submit} disabled={pending || objeto.trim().length < 5}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {pending ? 'Criando...' : 'Criar e iniciar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
