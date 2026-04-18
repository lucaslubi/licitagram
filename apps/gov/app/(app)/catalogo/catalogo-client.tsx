'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Loader2, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  type CatalogoItem,
  type CatalogoItemInput,
  deleteCatalogoItemAction,
  upsertCatalogoItemAction,
} from '@/lib/catalogo/actions'

interface Props {
  items: CatalogoItem[]
  canEdit: boolean
  initialQuery: string
}

const EMPTY: CatalogoItemInput = {
  id: null,
  codigoCatmat: null,
  codigoCatser: null,
  descricaoOficial: '',
  descricaoNormalizada: null,
  unidadeMedida: null,
  categoria: null,
  aliases: [],
}

export function CatalogoClient({ items, canEdit, initialQuery }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [form, setForm] = useState<CatalogoItemInput | null>(null)
  const [aliasInput, setAliasInput] = useState('')
  const [saving, startSave] = useTransition()
  const [deleting, startDelete] = useTransition()

  const runSearch = (q: string) => {
    const url = q ? `/catalogo?q=${encodeURIComponent(q)}` : '/catalogo'
    router.push(url)
  }

  const onEdit = (item: CatalogoItem) => {
    setForm({
      id: item.id,
      codigoCatmat: item.codigoCatmat,
      codigoCatser: item.codigoCatser,
      descricaoOficial: item.descricaoOficial,
      descricaoNormalizada: item.descricaoNormalizada,
      unidadeMedida: item.unidadeMedida,
      categoria: item.categoria,
      aliases: item.aliases,
    })
    setAliasInput('')
  }

  const addAlias = () => {
    const v = aliasInput.trim()
    if (!v || !form) return
    if (form.aliases.includes(v)) return
    setForm({ ...form, aliases: [...form.aliases, v] })
    setAliasInput('')
  }

  const removeAlias = (alias: string) => {
    if (!form) return
    setForm({ ...form, aliases: form.aliases.filter((a) => a !== alias) })
  }

  const save = () => {
    if (!form) return
    startSave(async () => {
      const res = await upsertCatalogoItemAction(form)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(form.id ? 'Item atualizado' : 'Item adicionado')
      setForm(null)
      router.refresh()
    })
  }

  const remove = (id: string) => {
    if (!window.confirm('Remover este item do catálogo? A ação não pode ser desfeita.')) return
    startDelete(async () => {
      const res = await deleteCatalogoItemAction(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Item removido')
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch(query)}
            placeholder="Busca por descrição, CATMAT, CATSER ou apelido…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => runSearch(query)}>
          Buscar
        </Button>
        {canEdit && (
          <Button variant="gradient" onClick={() => setForm({ ...EMPTY })}>
            <Plus className="h-4 w-4" />
            Novo item
          </Button>
        )}
      </div>

      {form && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">{form.id ? 'Editar item' : 'Novo item do catálogo'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="descricao">Descrição oficial *</Label>
              <Input
                id="descricao"
                value={form.descricaoOficial}
                onChange={(e) => setForm({ ...form, descricaoOficial: e.target.value })}
                placeholder="Ex.: Papel A4 75g/m², resma 500 folhas"
                maxLength={500}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="catmat">Código CATMAT</Label>
                <Input
                  id="catmat"
                  value={form.codigoCatmat ?? ''}
                  onChange={(e) => setForm({ ...form, codigoCatmat: e.target.value || null })}
                  maxLength={20}
                />
              </div>
              <div>
                <Label htmlFor="catser">Código CATSER</Label>
                <Input
                  id="catser"
                  value={form.codigoCatser ?? ''}
                  onChange={(e) => setForm({ ...form, codigoCatser: e.target.value || null })}
                  maxLength={20}
                />
              </div>
              <div>
                <Label htmlFor="unidade">Unidade de medida</Label>
                <Input
                  id="unidade"
                  value={form.unidadeMedida ?? ''}
                  onChange={(e) => setForm({ ...form, unidadeMedida: e.target.value || null })}
                  placeholder="Ex.: resma, kg, un, hora"
                  maxLength={50}
                />
              </div>
              <div>
                <Label htmlFor="categoria">Categoria</Label>
                <Input
                  id="categoria"
                  value={form.categoria ?? ''}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value || null })}
                  placeholder="Ex.: Material de escritório"
                  maxLength={100}
                />
              </div>
            </div>
            <div>
              <Label>Apelidos / sinônimos</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAlias())}
                  placeholder="Adicione e tecle Enter"
                />
                <Button variant="outline" onClick={addAlias}>
                  Adicionar
                </Button>
              </div>
              {form.aliases.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.aliases.map((alias) => (
                    <Badge key={alias} variant="secondary" className="gap-1">
                      {alias}
                      <button onClick={() => removeAlias(alias)} className="hover:text-destructive" aria-label={`remover ${alias}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving} variant="gradient">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
              <Button variant="outline" onClick={() => setForm(null)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card">
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descrição</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Códigos</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Categoria</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Apelidos</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Uso</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-card/40">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      {item.scope === 'global' ? (
                        <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                      <div>
                        <p className="font-medium">{item.descricaoOficial}</p>
                        {item.unidadeMedida && (
                          <p className="text-xs text-muted-foreground">Unid.: {item.unidadeMedida}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {item.codigoCatmat && <div>CATMAT: {item.codigoCatmat}</div>}
                    {item.codigoCatser && <div>CATSER: {item.codigoCatser}</div>}
                    {!item.codigoCatmat && !item.codigoCatser && <span>—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.categoria ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.aliases.slice(0, 3).map((a) => (
                        <Badge key={a} variant="outline" className="text-[11px]">
                          {a}
                        </Badge>
                      ))}
                      {item.aliases.length > 3 && (
                        <Badge variant="outline" className="text-[11px]">+{item.aliases.length - 3}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">{item.usoCount}</td>
                  <td className="px-4 py-3 text-right">
                    {canEdit && item.scope === 'orgao' && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => onEdit(item)} aria-label="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(item.id)}
                          disabled={deleting}
                          aria-label="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
