'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleUserActive, updateUserRole, deleteUser } from '@/actions/admin/users'

export function UserActions({ user }: { user: any }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleToggleActive() {
    startTransition(async () => {
      await toggleUserActive(user.id, !user.is_active)
      router.refresh()
    })
  }

  function handleRoleChange(role: string) {
    startTransition(async () => {
      await updateUserRole(user.id, role as 'admin' | 'user' | 'viewer')
      router.refresh()
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteUser(user.id)
      setConfirmDelete(false)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={user.role}
        onChange={(e) => handleRoleChange(e.target.value)}
        disabled={isPending}
        className="px-1.5 py-1 border rounded text-xs bg-[#23262a]"
      >
        <option value="admin">admin</option>
        <option value="user">user</option>
        <option value="viewer">viewer</option>
      </select>

      <button
        onClick={handleToggleActive}
        disabled={isPending}
        className={`px-2 py-1 rounded text-xs ${
          user.is_active
            ? 'bg-red-900/20 text-red-400 hover:bg-red-900/30'
            : 'bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/30'
        }`}
      >
        {user.is_active ? 'Desativar' : 'Ativar'}
      </button>

      {!confirmDelete ? (
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={isPending}
          className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-900/20"
        >
          Excluir
        </button>
      ) : (
        <span className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="px-2 py-1 rounded text-xs bg-red-600 text-white hover:bg-red-700"
          >
            {isPending ? '...' : 'Confirmar'}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="px-2 py-1 rounded text-xs border hover:bg-[#2d2f33]"
          >
            ×
          </button>
        </span>
      )}
    </div>
  )
}
