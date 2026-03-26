// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DriveFile {
  id: string
  company_id: string
  file_name: string
  file_size: number
  mime_type: string
  category: string
  description: string | null
  folder: string | null
  tags: string[] | null
  is_starred: boolean
  storage_path: string
  tender_id: string | null
  tender_name: string | null
  source: string | null
  created_at: string
  updated_at: string
}

interface DriveManagerProps {
  companyId: string
  companyName: string
}

type Category = 'todos' | 'edital' | 'certidao' | 'proposta' | 'contrato' | 'analise' | 'consultor' | 'geral'
type SortOption = 'newest' | 'oldest' | 'name' | 'size'
type ViewMode = 'grid' | 'list'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'edital', label: 'Editais' },
  { key: 'certidao', label: 'Certidões' },
  { key: 'proposta', label: 'Propostas' },
  { key: 'contrato', label: 'Contratos' },
  { key: 'analise', label: 'Analises' },
  { key: 'consultor', label: 'Consultor IA' },
  { key: 'geral', label: 'Geral' },
]

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  edital: { bg: 'bg-orange-900/20', text: 'text-orange-400' },
  certidao: { bg: 'bg-emerald-900/20', text: 'text-emerald-400' },
  proposta: { bg: 'bg-blue-900/20', text: 'text-blue-400' },
  contrato: { bg: 'bg-purple-900/20', text: 'text-purple-400' },
  analise: { bg: 'bg-amber-900/20', text: 'text-amber-400' },
  consultor: { bg: 'bg-cyan-900/20', text: 'text-cyan-400' },
  geral: { bg: 'bg-[#2d2f33]', text: 'text-gray-400' },
}

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'newest', label: 'Mais recente' },
  { key: 'oldest', label: 'Mais antigo' },
  { key: 'name', label: 'Nome A-Z' },
  { key: 'size', label: 'Maior tamanho' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / Math.pow(1024, i)
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[i]}`
}

function formatDatePtBr(dateStr: string): string {
  const d = new Date(dateStr)
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function getFileTypeInfo(mimeType: string, fileName: string): { type: string; color: string; bgColor: string } {
  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf'))
    return { type: 'PDF', color: 'text-red-400', bgColor: 'bg-red-900/20' }
  if (mimeType.startsWith('image/'))
    return { type: 'Imagem', color: 'text-blue-400', bgColor: 'bg-blue-900/20' }
  if (mimeType.includes('word') || mimeType.includes('document') || fileName.match(/\.(doc|docx|odt|rtf)$/))
    return { type: 'Doc', color: 'text-indigo-400', bgColor: 'bg-indigo-900/20' }
  if (mimeType.includes('sheet') || mimeType.includes('excel') || fileName.match(/\.(xls|xlsx|csv|ods)$/))
    return { type: 'Planilha', color: 'text-emerald-400', bgColor: 'bg-emerald-900/20' }
  return { type: 'Arquivo', color: 'text-gray-400', bgColor: 'bg-[#2d2f33]' }
}

// ── File Type Icons (inline SVG) ──────────────────────────────────────────────

function FileIcon({ mimeType, fileName, size = 32 }: { mimeType: string; fileName: string; size?: number }) {
  const { type } = getFileTypeInfo(mimeType, fileName)

  if (type === 'PDF') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-red-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <text x="12" y="17" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="bold">PDF</text>
      </svg>
    )
  }

  if (type === 'Imagem') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-blue-400">
        <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={1.5} />
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
        <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === 'Doc') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-indigo-400">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        <line x1="8" y1="17" x2="13" y2="17" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'Planilha') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-emerald-400">
        <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={1.5} />
        <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth={1.5} />
        <line x1="3" y1="15" x2="21" y2="15" stroke="currentColor" strokeWidth={1.5} />
        <line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" strokeWidth={1.5} />
        <line x1="15" y1="3" x2="15" y2="21" stroke="currentColor" strokeWidth={1.5} />
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-gray-400">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DriveManager({ companyId, companyName }: DriveManagerProps) {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<Category>('todos')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('newest')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [starredOnly, setStarredOnly] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadCategory, setUploadCategory] = useState('geral')
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Fetch files ───────────────────────────────────────────────────────────
  const fetchFiles = useCallback(async () => {
    try {
      const params = new URLSearchParams({ companyId })
      if (category !== 'todos') params.set('category', category)
      if (search) params.set('search', search)
      if (starredOnly) params.set('starred', 'true')

      const res = await fetch(`/api/drive?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setFiles(data.files || [])
      }
    } catch (e) {
      console.error('Failed to fetch drive files:', e)
    } finally {
      setLoading(false)
    }
  }, [companyId, category, search, starredOnly])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  // Polling every 30s
  useEffect(() => {
    const interval = setInterval(fetchFiles, 30000)
    return () => clearInterval(interval)
  }, [fetchFiles])

  // ── Sort & filter ─────────────────────────────────────────────────────────
  const sortedFiles = [...files].sort((a, b) => {
    switch (sort) {
      case 'newest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'name': return a.file_name.localeCompare(b.file_name)
      case 'size': return b.file_size - a.file_size
      default: return 0
    }
  })

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalSize = files.reduce((sum, f) => sum + f.file_size, 0)
  const categoriesUsed = new Set(files.map((f) => f.category)).size
  const starredCount = files.filter((f) => f.is_starred).length

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleStar(fileId: string, is_starred: boolean) {
    await fetch('/api/drive', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: fileId, is_starred: !is_starred }),
    })
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, is_starred: !is_starred } : f)))
  }

  async function handleDelete(fileId: string) {
    if (!confirm('Tem certeza que deseja excluir este arquivo?')) return
    await fetch('/api/drive', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: fileId }),
    })
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
    setMenuOpenId(null)
  }

  async function handleRename(fileId: string) {
    if (!renameValue.trim()) return
    await fetch('/api/drive', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: fileId, file_name: renameValue.trim() }),
    })
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, file_name: renameValue.trim() } : f)))
    setRenameId(null)
    setRenameValue('')
  }

  async function handleDownload(fileId: string) {
    try {
      const res = await fetch(`/api/drive/download?id=${fileId}`)
      const data = await res.json()
      if (data.url) window.open(data.url, '_blank')
      else alert('Erro ao gerar link de download')
    } catch { alert('Erro ao baixar arquivo') }
    setMenuOpenId(null)
  }

  // ── Upload handlers ───────────────────────────────────────────────────────
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    setUploadFiles((prev) => [...prev, ...droppedFiles])
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files ? Array.from(e.target.files) : []
    setUploadFiles((prev) => [...prev, ...selected])
  }

  function removeUploadFile(index: number) {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleUpload() {
    if (uploadFiles.length === 0) return
    setUploading(true)
    setUploadProgress(0)

    try {
      for (let i = 0; i < uploadFiles.length; i++) {
        const formData = new FormData()
        formData.append('file', uploadFiles[i])
        formData.append('companyId', companyId)
        formData.append('category', uploadCategory)
        if (uploadDescription) formData.append('description', uploadDescription)

        const uploadRes = await fetch('/api/drive', { method: 'POST', body: formData })
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({ error: 'Upload failed' }))
          console.error('Upload error:', err)
          alert(`Erro no upload de ${uploadFiles[i].name}: ${err.error || 'Erro desconhecido'}`)
        }
        setUploadProgress(Math.round(((i + 1) / uploadFiles.length) * 100))
      }

      setShowUpload(false)
      setUploadFiles([])
      setUploadCategory('geral')
      setUploadDescription('')
      setUploadProgress(0)
      fetchFiles()
    } catch (e) {
      console.error('Upload failed:', e)
    } finally {
      setUploading(false)
    }
  }

  // ── Close menu on outside click ───────────────────────────────────────────
  useEffect(() => {
    function handleClick() {
      setMenuOpenId(null)
    }
    if (menuOpenId) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [menuOpenId])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Drive Licitagram</h1>
          <p className="text-gray-400 mt-1">Memoria institucional da sua empresa</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F43E01] text-white text-sm font-medium rounded-[1000px] hover:bg-[#C23101] transition-all duration-150 ease-in-out shadow-sm"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload
        </button>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total de Arquivos', value: files.length.toString(), icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#F43E01]">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )},
          { label: 'Espaco Usado', value: formatFileSize(totalSize), icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#F43E01]">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )},
          { label: 'Categorias', value: categoriesUsed.toString(), icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#F43E01]">
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )},
          { label: 'Favoritos', value: starredCount.toString(), icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#F43E01]">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )},
        ].map((stat) => (
          <div key={stat.label} className="bg-[#1a1c1f] rounded-xl border border-[#2d2f33] p-4 flex items-center gap-3 hover:border-[#F43E01]/20 transition-all duration-150">
            <div className="w-10 h-10 rounded-[12px] bg-[#F43E01]/[0.08] flex items-center justify-center flex-shrink-0">
              {stat.icon}
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-white leading-tight">{stat.value}</p>
              <p className="text-xs text-gray-400 truncate">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters bar ────────────────────────────────────────────────── */}
      <div className="bg-[#1a1c1f] rounded-xl border border-[#2d2f33] p-3 sm:p-4 space-y-3">
        {/* Category tabs */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`px-3 py-1.5 text-sm rounded-[1000px] font-medium transition-all duration-150 ease-in-out ${
                category === cat.key
                  ? 'bg-[#F43E01] text-white'
                  : 'text-gray-400 hover:bg-[#2d2f33] hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search + sort + view */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Buscar arquivos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#2d2f33] rounded-[1000px] bg-[#13151a] text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#F43E01]/20 focus:border-[#F43E01]/40 transition-all"
            />
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="px-3 py-2 text-sm border border-[#2d2f33] rounded-[1000px] bg-[#13151a] text-white focus:outline-none focus:ring-2 focus:ring-[#F43E01]/20 cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>

          {/* View toggle */}
          <div className="flex border border-[#2d2f33] rounded-[1000px] overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 transition-all duration-150 ${viewMode === 'grid' ? 'bg-[#F43E01] text-white' : 'bg-[#13151a] text-gray-400 hover:text-white'}`}
              title="Visualizacao em grade"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 transition-all duration-150 ${viewMode === 'list' ? 'bg-[#F43E01] text-white' : 'bg-[#13151a] text-gray-400 hover:text-white'}`}
              title="Visualizacao em lista"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>

          {/* Starred filter */}
          <button
            onClick={() => setStarredOnly(!starredOnly)}
            className={`px-3 py-2 rounded-[1000px] border transition-all duration-150 ${
              starredOnly
                ? 'border-[#F43E01] bg-[#F43E01]/[0.08] text-[#F43E01]'
                : 'border-[#2d2f33] bg-[#13151a] text-gray-400 hover:text-white'
            }`}
            title="Apenas favoritos"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={starredOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Loading state ──────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-[#F43E01]/20 border-t-[#F43E01] rounded-full animate-spin" />
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!loading && sortedFiles.length === 0 && (
        <div className="bg-[#1a1c1f] rounded-xl border border-[#2d2f33] p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-[20px] bg-[#F43E01]/[0.06] flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-[#F43E01]">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="11" x2="12" y2="17" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
              <line x1="9" y1="14" x2="15" y2="14" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Seu Drive esta vazio</h3>
          <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
            Faca upload de documentos ou use o Consultor IA para gerar analises automaticamente
          </p>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#F43E01] text-white text-sm font-medium rounded-[1000px] hover:bg-[#C23101] transition-all duration-150 ease-in-out"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Fazer upload
          </button>
        </div>
      )}

      {/* ── Grid view ──────────────────────────────────────────────────── */}
      {!loading && sortedFiles.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sortedFiles.map((file) => {
            const fileType = getFileTypeInfo(file.mime_type, file.file_name)
            const catColor = CATEGORY_COLORS[file.category] || CATEGORY_COLORS.geral

            return (
              <div
                key={file.id}
                className="bg-[#1a1c1f] rounded-xl border border-[#2d2f33] p-4 hover:border-[#F43E01]/20 transition-all duration-200 group relative"
              >
                {/* Top row: icon + star + menu */}
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-12 h-12 rounded-[12px] ${fileType.bgColor} flex items-center justify-center`}>
                    <FileIcon mimeType={file.mime_type} fileName={file.file_name} size={28} />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleStar(file.id, file.is_starred)}
                      className="p-1.5 rounded-full hover:bg-[#2d2f33] transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={file.is_starred ? '#F43E01' : 'none'} stroke={file.is_starred ? '#F43E01' : '#6b7280'} strokeWidth={2}>
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === file.id ? null : file.id) }}
                        className="p-1.5 rounded-full hover:bg-[#2d2f33] transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-gray-400">
                          <circle cx="12" cy="5" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="19" r="1.5" />
                        </svg>
                      </button>
                      {menuOpenId === file.id && (
                        <div className="absolute right-0 top-8 z-20 w-44 bg-[#1a1c1f] rounded-xl border border-[#2d2f33] shadow-lg py-1 animate-in fade-in slide-in-from-top-1">
                          <button onClick={() => handleDownload(file.id)} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[#2d2f33] flex items-center gap-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                            Download
                          </button>
                          <button onClick={() => { setRenameId(file.id); setRenameValue(file.file_name); setMenuOpenId(null) }} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[#2d2f33] flex items-center gap-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                            Renomear
                          </button>
                          <hr className="my-1 border-[#2d2f33]" />
                          <button onClick={() => handleDelete(file.id)} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* File name */}
                {renameId === file.id ? (
                  <div className="flex gap-1 mb-2">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(file.id); if (e.key === 'Escape') setRenameId(null) }}
                      className="flex-1 text-sm border border-[#2d2f33] rounded-lg px-2 py-1 bg-[#13151a] text-white focus:outline-none focus:ring-2 focus:ring-[#F43E01]/20"
                    />
                    <button onClick={() => handleRename(file.id)} className="text-xs px-2 py-1 bg-[#F43E01] text-white rounded-lg">OK</button>
                  </div>
                ) : (
                  <h3 className="text-sm font-semibold text-white truncate mb-1" title={file.file_name}>
                    {file.file_name}
                  </h3>
                )}

                {/* Category badge */}
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-[1000px] ${catColor.bg} ${catColor.text}`}>
                  {file.category}
                </span>

                {/* Tender link */}
                {file.tender_name && (
                  <p className="text-xs text-gray-400 mt-2 truncate" title={file.tender_name}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="inline mr-1 -mt-0.5">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    {file.tender_name}
                  </p>
                )}

                {/* Meta: size + date */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#2d2f33]">
                  <span className="text-xs text-gray-400">{formatFileSize(file.file_size)}</span>
                  <span className="text-xs text-gray-400">{formatDatePtBr(file.created_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── List view ──────────────────────────────────────────────────── */}
      {!loading && sortedFiles.length > 0 && viewMode === 'list' && (
        <div className="bg-[#1a1c1f] rounded-xl border border-[#2d2f33] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2d2f33]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">Categoria</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">Tamanho</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">Fonte</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Data</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedFiles.map((file) => {
                  const catColor = CATEGORY_COLORS[file.category] || CATEGORY_COLORS.geral

                  return (
                    <tr key={file.id} className="border-b border-[#2d2f33]/50 hover:bg-[#2d2f33]/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <FileIcon mimeType={file.mime_type} fileName={file.file_name} size={24} />
                          <div className="min-w-0">
                            {renameId === file.id ? (
                              <div className="flex gap-1">
                                <input
                                  autoFocus
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(file.id); if (e.key === 'Escape') setRenameId(null) }}
                                  className="text-sm border border-[#2d2f33] rounded-lg px-2 py-0.5 bg-[#13151a] text-white focus:outline-none focus:ring-2 focus:ring-[#F43E01]/20"
                                />
                                <button onClick={() => handleRename(file.id)} className="text-xs px-2 py-0.5 bg-[#F43E01] text-white rounded-lg">OK</button>
                              </div>
                            ) : (
                              <p className="font-medium text-white truncate max-w-[240px]" title={file.file_name}>{file.file_name}</p>
                            )}
                            {file.tender_name && (
                              <p className="text-xs text-gray-400 truncate max-w-[200px]">{file.tender_name}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-[1000px] ${catColor.bg} ${catColor.text}`}>
                          {file.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{formatFileSize(file.file_size)}</td>
                      <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">{file.source || 'Upload'}</td>
                      <td className="px-4 py-3 text-gray-400">{formatDatePtBr(file.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleStar(file.id, file.is_starred)}
                            className="p-1.5 rounded-full hover:bg-[#2d2f33] transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={file.is_starred ? '#F43E01' : 'none'} stroke={file.is_starred ? '#F43E01' : '#6b7280'} strokeWidth={2}>
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          </button>
                          <button onClick={() => handleDownload(file.id)} className="p-1.5 rounded-full hover:bg-[#2d2f33] transition-colors" title="Download">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          </button>
                          <button onClick={() => { setRenameId(file.id); setRenameValue(file.file_name) }} className="p-1.5 rounded-full hover:bg-[#2d2f33] transition-colors" title="Renomear">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2}><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                          </button>
                          <button onClick={() => handleDelete(file.id)} className="p-1.5 rounded-full hover:bg-red-900/20 transition-colors" title="Excluir">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Upload dialog (modal overlay) ──────────────────────────────── */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { if (!uploading) setShowUpload(false) }} />

          {/* Modal */}
          <div className="relative bg-[#1a1c1f] rounded-xl border border-[#2d2f33] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white">Upload de Arquivos</h2>
                <button
                  onClick={() => { if (!uploading) setShowUpload(false) }}
                  className="p-1.5 rounded-full hover:bg-[#2d2f33] transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth={2} strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-[16px] p-8 text-center cursor-pointer transition-all duration-200 ${
                  dragOver
                    ? 'border-[#F43E01] bg-[#F43E01]/[0.04]'
                    : 'border-[#2d2f33] hover:border-[#F43E01]/40 hover:bg-[#2d2f33]/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-12 h-12 mx-auto mb-3 rounded-[12px] bg-[#F43E01]/[0.08] flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#F43E01]" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-white">Arraste arquivos aqui ou clique para selecionar</p>
                <p className="text-xs text-gray-400 mt-1">PDF, imagens, documentos, planilhas</p>
              </div>

              {/* Selected files */}
              {uploadFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-[#2d2f33]/50 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileIcon mimeType={f.type} fileName={f.name} size={20} />
                        <span className="text-sm text-white truncate">{f.name}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{formatFileSize(f.size)}</span>
                      </div>
                      <button onClick={() => removeUploadFile(i)} className="p-1 text-gray-400 hover:text-red-400 flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Category */}
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Categoria</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-[#2d2f33] rounded-xl bg-[#13151a] text-white focus:outline-none focus:ring-2 focus:ring-[#F43E01]/20 cursor-pointer"
                >
                  {CATEGORIES.filter((c) => c.key !== 'todos').map((cat) => (
                    <option key={cat.key} value={cat.key}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="mt-3">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Descrição (opcional)</label>
                <textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  rows={2}
                  placeholder="Breve descrição dos arquivos..."
                  className="mt-1 w-full px-3 py-2 text-sm border border-[#2d2f33] rounded-xl bg-[#13151a] text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#F43E01]/20 resize-none"
                />
              </div>

              {/* Progress */}
              {uploading && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">Enviando...</span>
                    <span className="text-xs font-medium text-[#F43E01]">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-[#2d2f33] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#F43E01] rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => { if (!uploading) setShowUpload(false) }}
                  disabled={uploading}
                  className="px-4 py-2 text-sm font-medium text-gray-400 rounded-[1000px] hover:bg-[#2d2f33] transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading || uploadFiles.length === 0}
                  className="px-5 py-2 text-sm font-medium bg-[#F43E01] text-white rounded-[1000px] hover:bg-[#C23101] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Enviando...' : `Enviar ${uploadFiles.length > 0 ? `(${uploadFiles.length})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
