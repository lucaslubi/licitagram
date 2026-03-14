'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function AddWatchlistForm({ companyId }: { companyId: string }) {
  const [cnpj, setCnpj] = useState('')
  const [nome, setNome] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!companyId) {
      setError('Empresa não cadastrada. Configure sua empresa primeiro.')
      return
    }

    const cleanCnpj = cnpj.replace(/\D/g, '')
    if (cleanCnpj.length !== 14) {
      setError('CNPJ deve ter 14 dígitos')
      return
    }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: insertError } = await supabase
      .from('competitor_watchlist')
      .insert({
        company_id: companyId,
        competitor_cnpj: cleanCnpj,
        competitor_nome: nome || null,
        notes: notes || null,
      })

    setLoading(false)

    if (insertError) {
      if (insertError.code === '23505') {
        setError('Este CNPJ já está na sua watchlist')
      } else {
        setError('Erro ao adicionar: ' + insertError.message)
      }
      return
    }

    setCnpj('')
    setNome('')
    setNotes('')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
      <div>
        <label className="text-sm font-medium text-gray-700">CNPJ</label>
        <input
          type="text"
          value={cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          placeholder="00.000.000/0000-00"
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">Nome (opcional)</label>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Razão Social"
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">Notas (opcional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: concorrente direto em TI"
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="h-10 px-4 bg-brand text-white rounded-md hover:bg-brand/90 text-sm disabled:opacity-50"
      >
        {loading ? 'Adicionando...' : 'Adicionar'}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  )
}
