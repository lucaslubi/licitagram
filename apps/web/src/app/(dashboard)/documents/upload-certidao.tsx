'use client'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface ExtractedData {
  tipo: string | null
  status: string | null
  validade: string | null
  numero: string | null
  orgao_emissor: string | null
  resumo: string | null
}

type UploadStep = 'idle' | 'uploading' | 'extracting' | 'confirm' | 'saving' | 'done' | 'error'

export function UploadCertidao({ companyId }: { companyId: string }) {
  const [step, setStep] = useState<UploadStep>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState<number>(0)
  const [storagePath, setStoragePath] = useState('')
  const [extracted, setExtracted] = useState<ExtractedData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const reset = useCallback(() => {
    setStep('idle')
    setDragOver(false)
    setFileName('')
    setFileSize(0)
    setStoragePath('')
    setExtracted(null)
    setErrorMsg('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  async function handleFile(file: File) {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Apenas arquivos PDF são aceitos.')
      setStep('error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Arquivo muito grande. Máximo: 5MB.')
      setStep('error')
      return
    }

    setFileName(file.name)
    setFileSize(file.size)
    setStep('uploading')
    setErrorMsg('')

    try {
      const supabase = createClient()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${companyId}/certidoes/${Date.now()}_${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('drive')
        .upload(path, file, { contentType: 'application/pdf', upsert: false })

      if (uploadError) {
        setErrorMsg('Erro ao enviar arquivo: ' + uploadError.message)
        setStep('error')
        return
      }

      setStoragePath(path)
      setStep('extracting')

      const res = await fetch('/api/certidoes/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: path, companyId }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || 'Erro ao extrair dados do PDF.')
        setStep('error')
        return
      }

      setExtracted(data.extracted)
      setStep('confirm')
    } catch (err) {
      console.error('[UploadCertidao] Error:', err)
      setErrorMsg('Erro inesperado. Tente novamente.')
      setStep('error')
    }
  }

  async function handleConfirm() {
    if (!extracted) return
    setStep('saving')

    try {
      const supabase = createClient()

      const proxyUrl = `/api/drive/proxy?path=${encodeURIComponent(storagePath)}`

      let dbStatus = 'valido'
      if (extracted.status === 'irregular' || (extracted.validade && new Date(extracted.validade) < new Date())) {
        dbStatus = 'vencido'
      }

      const { error: insertError } = await supabase.from('company_documents').insert({
        company_id: companyId,
        tipo: extracted.tipo || 'outro',
        descricao: extracted.resumo
          ? `[Upload] ${extracted.resumo} (${extracted.status || 'sem status'})`
          : `[Upload] ${fileName}`,
        numero: extracted.numero || null,
        validade: extracted.validade || null,
        status: dbStatus,
        origem: 'upload',
        arquivo_url: proxyUrl,
      })

      // Also save to Drive
      const { data: userData } = await supabase.auth.getUser()
      if (userData.user) {
        await supabase.from('drive_files').insert({
          company_id: companyId,
          user_id: userData.user.id,
          file_name: fileName,
          file_type: 'pdf',
          mime_type: 'application/pdf',
          file_size: fileSize,
          storage_path: storagePath,
          folder: '/certidoes',
          category: 'certidao',
          description: extracted.resumo || null,
          source: 'upload',
          tags: extracted.tipo ? [extracted.tipo] : ['certidao']
        })
      }

      if (insertError) {
        setErrorMsg('Erro ao salvar: ' + insertError.message)
        setStep('error')
        return
      }

      setStep('done')
      router.refresh()
      setTimeout(() => reset(), 3000)
    } catch (err) {
      console.error('[UploadCertidao] Save error:', err)
      setErrorMsg('Erro ao salvar documento.')
      setStep('error')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const STATUS_LABELS: Record<string, string> = {
    regular: 'Regular',
    irregular: 'Irregular',
    positiva_com_efeito_negativa: 'Positiva com Efeito de Negativa',
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      {(step === 'idle' || step === 'error') && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${dragOver
              ? 'border-brand bg-brand/10'
              : 'border-[#2d2f33] hover:border-gray-500 bg-[#1a1c1f]'
            }
          `}
        >
          <svg className="mx-auto h-10 w-10 text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="text-gray-300 text-sm font-medium">
            Arraste um PDF aqui ou clique para selecionar
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Máximo 5MB - A IA extrairá os dados automaticamente
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
      )}

      {/* Uploading state */}
      {step === 'uploading' && (
        <div className="flex items-center gap-3 p-4 bg-[#1a1c1f] rounded-lg border border-[#2d2f33]">
          <div className="animate-spin h-5 w-5 border-2 border-brand border-t-transparent rounded-full" />
          <div>
            <p className="text-gray-300 text-sm font-medium">Enviando {fileName}...</p>
            <p className="text-gray-500 text-xs">Fazendo upload para o servidor</p>
          </div>
        </div>
      )}

      {/* Extracting state */}
      {step === 'extracting' && (
        <div className="flex items-center gap-3 p-4 bg-[#1a1c1f] rounded-lg border border-[#2d2f33]">
          <div className="animate-spin h-5 w-5 border-2 border-brand border-t-transparent rounded-full" />
          <div>
            <p className="text-gray-300 text-sm font-medium">Analisando documento com IA...</p>
            <p className="text-gray-500 text-xs">Extraindo tipo, validade e status da certidão</p>
          </div>
        </div>
      )}

      {/* Confirmation step */}
      {step === 'confirm' && extracted && (
        <div className="p-4 bg-[#1a1c1f] rounded-lg border border-[#2d2f33] space-y-3">
          <p className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Dados extraídos de {fileName}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between sm:justify-start sm:gap-2">
              <span className="text-gray-500">Tipo:</span>
              <span className="text-gray-200">{extracted.tipo || '—'}</span>
            </div>
            <div className="flex justify-between sm:justify-start sm:gap-2">
              <span className="text-gray-500">Status:</span>
              <span className={`${
                extracted.status === 'regular' ? 'text-emerald-400' :
                extracted.status === 'irregular' ? 'text-red-400' :
                'text-amber-400'
              }`}>
                {extracted.status ? (STATUS_LABELS[extracted.status] || extracted.status) : '—'}
              </span>
            </div>
            <div className="flex justify-between sm:justify-start sm:gap-2">
              <span className="text-gray-500">Validade:</span>
              <span className="text-gray-200">
                {extracted.validade
                  ? new Date(extracted.validade + 'T12:00:00').toLocaleDateString('pt-BR')
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between sm:justify-start sm:gap-2">
              <span className="text-gray-500">Número:</span>
              <span className="text-gray-200">{extracted.numero || '—'}</span>
            </div>
            {extracted.orgao_emissor && (
              <div className="flex justify-between sm:justify-start sm:gap-2 sm:col-span-2">
                <span className="text-gray-500">Órgão Emissor:</span>
                <span className="text-gray-200">{extracted.orgao_emissor}</span>
              </div>
            )}
            {extracted.resumo && (
              <div className="sm:col-span-2">
                <span className="text-gray-500">Resumo:</span>{' '}
                <span className="text-gray-300">{extracted.resumo}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-brand text-white rounded-md hover:bg-brand/90 text-sm font-medium"
            >
              Confirmar e Salvar
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 bg-[#2d2f33] text-gray-300 rounded-md hover:bg-[#363840] text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Saving state */}
      {step === 'saving' && (
        <div className="flex items-center gap-3 p-4 bg-[#1a1c1f] rounded-lg border border-[#2d2f33]">
          <div className="animate-spin h-5 w-5 border-2 border-brand border-t-transparent rounded-full" />
          <p className="text-gray-300 text-sm">Salvando documento...</p>
        </div>
      )}

      {/* Done state */}
      {step === 'done' && (
        <div className="flex items-center gap-2 p-4 bg-emerald-900/20 rounded-lg border border-emerald-800/30">
          <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-emerald-400 text-sm font-medium">Certidão salva com sucesso!</p>
        </div>
      )}

      {/* Error state */}
      {step === 'error' && errorMsg && (
        <div className="flex items-center justify-between p-3 bg-red-900/20 rounded-lg border border-red-800/30">
          <p className="text-red-400 text-sm">{errorMsg}</p>
          <button onClick={reset} className="text-red-400 hover:text-red-300 text-xs underline ml-2">
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  )
}
