'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { grantAdmin, revokeAdmin, updateAdminPermissions } from '@/actions/admin/admins'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const ALL_SECTIONS = ['dashboard', 'clients', 'plans', 'users', 'financial', 'admins', 'audit'] as const

export function AdminCard({ admin }: { admin: any }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const perms = admin.admin_permissions as Record<string, boolean> | null
  const isSuperAdmin = !perms // null = super admin

  const [localPerms, setLocalPerms] = useState<Record<string, boolean>>(
    perms || Object.fromEntries(ALL_SECTIONS.map((s) => [s, true]))
  )

  function handleSavePerms() {
    startTransition(async () => {
      await updateAdminPermissions(admin.id, localPerms)
      setEditing(false)
      router.refresh()
    })
  }

  function handleRevoke() {
    startTransition(async () => {
      await revokeAdmin(admin.id)
      setConfirmRevoke(false)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{admin.full_name || admin.email || admin.id}</CardTitle>
          {isSuperAdmin ? (
            <Badge className="bg-amber-900/20 text-amber-400 border-amber-800" variant="outline">Super Admin</Badge>
          ) : (
            <Badge variant="outline">Delegado</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <p className="text-gray-400">{admin.email}</p>
        <p className="text-xs text-gray-400">Desde {new Date(admin.created_at).toLocaleDateString('pt-BR')}</p>

        {!editing && perms && (
          <div className="pt-2 border-t">
            <p className="text-xs text-gray-400 mb-1">Permissões:</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(perms)
                .filter(([, v]) => v)
                .map(([k]) => (
                  <span key={k} className="bg-blue-900/20 text-blue-400 text-[10px] px-1.5 py-0.5 rounded">{k}</span>
                ))}
            </div>
          </div>
        )}

        {editing && (
          <div className="pt-2 border-t space-y-2">
            <p className="text-xs text-gray-400">Editar permissões:</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_SECTIONS.map((section) => (
                <label key={section} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!localPerms[section]}
                    onChange={() => setLocalPerms((p) => ({ ...p, [section]: !p[section] }))}
                    className="rounded border-[#2d2f33]"
                  />
                  {section}
                </label>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSavePerms} disabled={isPending} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-500">
                {isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 border rounded text-xs hover:bg-[#2d2f33]">
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="pt-2 border-t flex gap-2">
          {!isSuperAdmin && !editing && (
            <button onClick={() => setEditing(true)} className="px-3 py-1.5 bg-brand text-white rounded text-xs hover:bg-brand/80">
              Editar Permissões
            </button>
          )}
          {!confirmRevoke ? (
            <button onClick={() => setConfirmRevoke(true)} className="px-3 py-1.5 border border-red-800 text-red-400 rounded text-xs hover:bg-red-900/20">
              Remover Admin
            </button>
          ) : (
            <span className="flex items-center gap-1">
              <button onClick={handleRevoke} disabled={isPending} className="px-3 py-1.5 bg-red-600 text-white rounded text-xs">
                {isPending ? '...' : 'Confirmar remoção'}
              </button>
              <button onClick={() => setConfirmRevoke(false)} className="px-3 py-1.5 border rounded text-xs">
                Cancelar
              </button>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function AddAdminForm({ existingAdminIds }: { existingAdminIds: string[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [userId, setUserId] = useState('')
  const [asSuperAdmin, setAsSuperAdmin] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function handleAdd() {
    if (!userId.trim()) return
    setMsg(null)
    startTransition(async () => {
      const permissions = asSuperAdmin
        ? undefined
        : Object.fromEntries(ALL_SECTIONS.map((s) => [s, true]))
      const res = await grantAdmin(userId.trim(), permissions)
      if (res.error) {
        setMsg(`Erro: ${res.error}`)
      } else {
        setMsg('Admin adicionado!')
        setUserId('')
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Adicionar Admin</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <label className="text-xs text-gray-400 block mb-1">User ID (UUID)</label>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Cole o ID do usuário..."
            className="w-full px-2 py-1.5 border rounded text-sm font-mono"
          />
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={asSuperAdmin}
            onChange={() => setAsSuperAdmin(!asSuperAdmin)}
            className="rounded border-[#2d2f33]"
          />
          Super Admin (acesso total, sem restrição)
        </label>
        {msg && <p className={`text-xs ${msg.startsWith('Erro') ? 'text-red-400' : 'text-emerald-400'}`}>{msg}</p>}
        <button
          onClick={handleAdd}
          disabled={isPending || !userId.trim()}
          className="px-4 py-2 bg-brand text-white rounded text-xs hover:bg-brand/80 disabled:opacity-50"
        >
          {isPending ? 'Adicionando...' : 'Adicionar'}
        </button>
      </CardContent>
    </Card>
  )
}
