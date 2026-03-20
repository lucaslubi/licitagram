'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function DeleteDocumentButton({ docId }: { docId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    if (!confirm('Tem certeza que deseja remover este documento?')) return

    setLoading(true)
    const supabase = createClient()
    await supabase.from('company_documents').delete().eq('id', docId)
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-red-500 hover:text-red-700 text-xs disabled:opacity-50"
      title="Remover documento"
    >
      {loading ? '...' : '🗑️ Remover'}
    </button>
  )
}

export function EditDocumentForm({
  doc,
  documentTypes,
  onClose,
}: {
  doc: { id: string; tipo: string; descricao: string | null; numero: string | null; validade: string | null }
  documentTypes: Record<string, string>
  onClose: () => void
}) {
  const [tipo, setTipo] = useState(doc.tipo)
  const [descricao, setDescricao] = useState(doc.descricao || '')
  const [numero, setNumero] = useState(doc.numero || '')
  const [validade, setValidade] = useState(doc.validade || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('company_documents')
      .update({
        tipo,
        descricao: descricao || null,
        numero: numero || null,
        validade: validade || null,
      })
      .eq('id', doc.id)

    setLoading(false)

    if (updateError) {
      setError('Erro ao atualizar: ' + updateError.message)
      return
    }

    router.refresh()
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end bg-blue-50 p-3 rounded-md">
      <div className="min-w-[160px]">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          {Object.entries(documentTypes).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[120px]">
        <input
          type="text"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrição"
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
      </div>
      <div className="min-w-[100px]">
        <input
          type="text"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="Número"
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
      </div>
      <div className="min-w-[130px]">
        <input
          type="date"
          value={validade}
          onChange={(e) => setValidade(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="h-9 px-3 bg-brand text-white rounded-md text-xs hover:bg-brand/90 disabled:opacity-50"
      >
        {loading ? 'Salvando...' : 'Salvar'}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="h-9 px-3 bg-gray-200 text-gray-700 rounded-md text-xs hover:bg-gray-300"
      >
        Cancelar
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  )
}

export function DocumentRow({
  doc,
  documentTypes,
  daysLeft,
  statusBadge,
  originBadge,
}: {
  doc: {
    id: string
    tipo: string
    descricao: string | null
    numero: string | null
    validade: string | null
    computedStatus: string
    arquivo_url?: string | null
  }
  documentTypes: Record<string, string>
  daysLeft: number | null
  statusBadge: React.ReactNode
  originBadge?: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <tr>
        <td colSpan={7} className="p-2">
          <EditDocumentForm
            doc={doc}
            documentTypes={documentTypes}
            onClose={() => setEditing(false)}
          />
        </td>
      </tr>
    )
  }

  // Clean description (remove [Auto] prefix for display)
  const displayDesc = doc.descricao?.replace(/^\[Auto\]\s*/, '') || '-'

  return (
    <tr className="border-b transition-colors hover:bg-muted/50">
      <td className="p-4 text-sm font-medium">
        {documentTypes[doc.tipo] || doc.tipo}
      </td>
      <td className="p-4 text-sm text-gray-600 hidden sm:table-cell">
        <span className="line-clamp-2">{displayDesc}</span>
      </td>
      <td className="p-4 text-sm font-mono hidden md:table-cell">
        {doc.numero || '-'}
      </td>
      <td className="p-4 text-sm">
        {doc.validade ? (
          <span>
            {new Date(doc.validade).toLocaleDateString('pt-BR')}
            {daysLeft !== null && daysLeft >= 0 && (
              <span className="text-xs text-gray-400 ml-1">({daysLeft}d)</span>
            )}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="p-4">{statusBadge}</td>
      <td className="p-4">{originBadge}</td>
      <td className="p-4">
        <div className="flex gap-2">
          {doc.arquivo_url && (
            <a
              href={doc.arquivo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:text-brand/70 text-xs"
            >
              PDF
            </a>
          )}
          <button
            onClick={() => setEditing(true)}
            className="text-blue-500 hover:text-blue-700 text-xs"
          >
            Editar
          </button>
          <DeleteDocumentButton docId={doc.id} />
        </div>
      </td>
    </tr>
  )
}
