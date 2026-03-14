'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function AddDocumentForm({
  companyId,
  documentTypes,
}: {
  companyId: string
  documentTypes: Record<string, string>
}) {
  const [tipo, setTipo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [numero, setNumero] = useState('')
  const [validade, setValidade] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tipo) {
      setError('Selecione o tipo do documento')
      return
    }

    setLoading(true)
    setError('')
    setSuccess(false)

    const supabase = createClient()
    const { error: insertError } = await supabase.from('company_documents').insert({
      company_id: companyId,
      tipo,
      descricao: descricao || null,
      numero: numero || null,
      validade: validade || null,
    })

    setLoading(false)

    if (insertError) {
      setError('Erro ao adicionar: ' + insertError.message)
      return
    }

    setTipo('')
    setDescricao('')
    setNumero('')
    setValidade('')
    setSuccess(true)
    router.refresh()
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
      <div className="min-w-[200px]">
        <label className="text-sm font-medium text-gray-700">Tipo *</label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          required
        >
          <option value="">Selecione...</option>
          {Object.entries(documentTypes).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="text-sm font-medium text-gray-700">Descrição</label>
        <input
          type="text"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex: CND emitida em 01/03/2026"
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="min-w-[120px]">
        <label className="text-sm font-medium text-gray-700">Número</label>
        <input
          type="text"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="Número"
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="min-w-[140px]">
        <label className="text-sm font-medium text-gray-700">Validade</label>
        <input
          type="date"
          value={validade}
          onChange={(e) => setValidade(e.target.value)}
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
      {success && <p className="w-full text-sm text-green-600">Documento adicionado com sucesso!</p>}
    </form>
  )
}
