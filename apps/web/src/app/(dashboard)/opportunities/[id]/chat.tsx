'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface UploadedDoc {
  name: string
  chars: number
  pages: number
  text: string
}

interface DocumentInfo {
  id: string
  titulo: string | null
  tipo: string | null
  url: string
}

interface EditalChatProps {
  tenderId: string
  documentCount?: number
  documentUrls?: DocumentInfo[]
  hasAccess?: boolean
}

const SUGGESTED_QUESTIONS = [
  'Quais documentos preciso apresentar?',
  'Qual o prazo para participação?',
  'Posso participar como consórcio?',
  'Quais são os critérios de habilitação?',
  'Qual o valor estimado e forma de pagamento?',
]

const INITIAL_PROMPT =
  'Faça um resumo executivo deste edital em bullet points curtos: objeto, valor, prazo de abertura, principais documentos exigidos e 2-3 pontos de atenção. Seja breve e direto.'

/**
 * Extract text from a PDF file in the browser using pdf.js.
 */
async function extractPdfInBrowser(file: File): Promise<{ text: string; pages: number }> {
  const pdfjsLib = await import('pdfjs-dist')
  // Use CDN worker to avoid Next.js 14 Terser/ESM bundling issues
  const pdfjsVersion = pdfjsLib.version
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const textParts: string[] = []
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: unknown) => (item as { str?: string }).str || '')
      .join(' ')
    if (pageText.trim()) {
      textParts.push(pageText)
    }
  }

  const fullText = textParts.join('\n\n').trim()
  return { text: fullText, pages: pdfDoc.numPages }
}

export function EditalChat({ tenderId, documentCount = 0, documentUrls = [], hasAccess = true }: EditalChatProps) {
  const [started, setStarted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [extractingDocs, setExtractingDocs] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)

  // Scroll only inside the chat messages container — never the page
  useEffect(() => {
    const container = messagesContainerRef.current
    if (container) {
      requestAnimationFrame(() => {
        // Save page scroll position so the page doesn't jump during streaming
        const pageScrollY = window.scrollY
        container.scrollTop = container.scrollHeight
        // Restore page position if the browser moved it
        if (window.scrollY !== pageScrollY) {
          window.scrollTo({ top: pageScrollY })
        }
      })
    }
  }, [messages])

  useEffect(() => {
    if (!loading && started) inputRef.current?.focus()
  }, [loading, started])

  const getUploadedDocsText = useCallback(() => {
    if (uploadedDocs.length === 0) return undefined
    return uploadedDocs
      .map((doc) => `--- ${doc.name} (${doc.pages} páginas) ---\n${doc.text}`)
      .join('\n\n')
  }, [uploadedDocs])

  const processFile = useCallback(
    async (file: File) => {
      if (uploadingFile) return
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        setError('Apenas arquivos PDF são aceitos.')
        return
      }
      if (file.size > 100 * 1024 * 1024) {
        setError('Arquivo muito grande. Máximo: 100MB.')
        return
      }
      if (uploadedDocs.some((d) => d.name === file.name)) {
        setError(`"${file.name}" já foi enviado.`)
        return
      }

      setError(null)
      setUploadingFile(true)

      try {
        const { text, pages } = await extractPdfInBrowser(file)
        if (!text || text.length < 30) {
          setError('Não foi possível extrair texto deste PDF. Pode ser uma imagem escaneada.')
          setUploadingFile(false)
          return
        }
        setUploadedDocs((prev) => [...prev, { name: file.name, chars: text.length, pages, text }])
      } catch (err) {
        console.error('PDF extraction error:', err)
        setError('Erro ao processar o PDF. Verifique se o arquivo não está corrompido.')
      }
      setUploadingFile(false)
    },
    [uploadingFile, uploadedDocs],
  )

  // ── Drag & Drop handlers (with counter to fix child-element flicker) ──
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setDragOver(false)

      const files = Array.from(e.dataTransfer.files)
      // Process all PDFs dropped
      for (const file of files) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          processFile(file)
        }
      }
    },
    [processFile],
  )

  const sendMessage = useCallback(
    async (question: string, allMessages: Message[]) => {
      if (!question.trim() || loading) return

      setError(null)
      const userMsg: Message = { role: 'user', content: question.trim() }
      const updatedMessages = [...allMessages, userMsg]
      setMessages(updatedMessages)
      setInput('')
      setLoading(true)

      if (allMessages.length === 0) setExtractingDocs(true)

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      try {
        const historyForApi = updatedMessages.filter((m) => m.content.trim() !== '').slice(0, -1)
        const uploadedText = getUploadedDocsText()

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenderId,
            question: question.trim(),
            messages: historyForApi.length > 0 ? historyForApi : undefined,
            uploadedDocsText: uploadedText,
          }),
        })

        setExtractingDocs(false)

        if (!response.ok) {
          const errorData = await response.json().catch(() => null)
          const errorMsg =
            errorData?.error ||
            (response.status === 403
              ? 'Recurso disponível apenas para planos com Chat IA.'
              : response.status === 429
                ? 'Limite de requisições atingido. Aguarde um momento.'
                : 'Ocorreu um erro ao processar sua pergunta.')
          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: errorMsg }
            return updated
          })
          setLoading(false)
          return
        }

        const reader = response.body?.getReader()
        if (!reader) { setLoading(false); return }

        const decoder = new TextDecoder()
        let accumulated = ''
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data) as { content?: string }
                if (parsed.content) {
                  accumulated += parsed.content
                  setMessages((prev) => {
                    const updated = [...prev]
                    updated[updated.length - 1] = { role: 'assistant', content: accumulated }
                    return updated
                  })
                }
              } catch { /* skip */ }
            }
          }
        }
      } catch {
        setExtractingDocs(false)
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: 'Erro de conexão. Verifique sua internet.' }
          return updated
        })
      }
      setLoading(false)
    },
    [loading, tenderId, getUploadedDocsText],
  )

  /**
   * Auto-download PDFs from document URLs in the browser and extract text.
   * Browser requests to government sites work fine (only server-side gets blocked).
   */
  const autoDownloadDocs = useCallback(async (): Promise<UploadedDoc[]> => {
    const pdfUrls = documentUrls.filter(
      (doc) => doc.url && !uploadedDocs.some((u) => u.name === (doc.titulo || doc.tipo || 'Documento'))
    )
    if (pdfUrls.length === 0) return []

    setUploadingFile(true)
    const downloaded: UploadedDoc[] = []

    for (const doc of pdfUrls) {
      const docName = doc.titulo || doc.tipo || 'Documento do Edital'
      try {
        console.log(`[Chat Auto] Downloading via proxy: ${doc.url.slice(0, 80)}`)
        // Use our proxy to bypass CORS — government sites don't set CORS headers
        const proxyUrl = `/api/chat/proxy-pdf?url=${encodeURIComponent(doc.url)}`
        const response = await fetch(proxyUrl, {
          signal: AbortSignal.timeout(90_000),
        })
        if (!response.ok) {
          console.warn(`[Chat Auto] HTTP ${response.status} for ${docName}`)
          continue
        }
        const blob = await response.blob()
        // Check if it looks like a PDF (by content-type or URL)
        const ct = response.headers.get('content-type') || ''
        const isPdf =
          ct.includes('pdf') ||
          ct.includes('octet-stream') ||
          ct.includes('binary') ||
          doc.url.toLowerCase().includes('.pdf')
        if (!isPdf && !ct.includes('application/')) {
          console.warn(`[Chat Auto] Not a PDF: ${ct} for ${docName}`)
          continue
        }
        if (blob.size < 100 || blob.size > 100 * 1024 * 1024) {
          console.warn(`[Chat Auto] Invalid size: ${blob.size} for ${docName}`)
          continue
        }

        const file = new File([blob], `${docName}.pdf`, { type: 'application/pdf' })
        const { text, pages } = await extractPdfInBrowser(file)
        if (text && text.length >= 30) {
          const newDoc: UploadedDoc = { name: docName, chars: text.length, pages, text }
          downloaded.push(newDoc)
          console.log(`[Chat Auto] Extracted ${text.length} chars, ${pages} pages from "${docName}"`)
        } else {
          console.warn(`[Chat Auto] No text extracted from ${docName}`)
        }
      } catch (err) {
        console.warn(`[Chat Auto] Failed to download ${docName}:`, err)
      }
    }

    if (downloaded.length > 0) {
      setUploadedDocs((prev) => [...prev, ...downloaded])
    }
    setUploadingFile(false)
    return downloaded
  }, [documentUrls, uploadedDocs])

  async function handleStart() {
    setStarted(true)
    setExtractingDocs(true)

    // Auto-download PDFs from edital document URLs before sending first message
    let allDocs = [...uploadedDocs]
    if (documentUrls.length > 0 && uploadedDocs.length === 0) {
      const autoDownloaded = await autoDownloadDocs()
      allDocs = [...uploadedDocs, ...autoDownloaded]
    }
    setExtractingDocs(false)

    // Build uploaded text including auto-downloaded docs
    const uploadedText = allDocs.length > 0
      ? allDocs.map((doc) => `--- ${doc.name} (${doc.pages} páginas) ---\n${doc.text}`).join('\n\n')
      : undefined

    // Send the initial prompt with the docs text directly (don't rely on state update timing)
    const userMsg: Message = { role: 'user', content: INITIAL_PROMPT }
    setMessages([userMsg])
    setInput('')
    setLoading(true)
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderId,
          question: INITIAL_PROMPT,
          uploadedDocsText: uploadedText,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const errorMsg =
          errorData?.error ||
          (response.status === 403
            ? 'Recurso disponível apenas para planos com Chat IA.'
            : response.status === 429
              ? 'Limite de requisições atingido. Aguarde um momento.'
              : 'Ocorreu um erro ao processar sua pergunta.')
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: errorMsg }
          return updated
        })
        setLoading(false)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) { setLoading(false); return }

      const decoder = new TextDecoder()
      let accumulated = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data) as { content?: string }
              if (parsed.content) {
                accumulated += parsed.content
                setMessages((prev) => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'assistant', content: accumulated }
                  return updated
                })
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Erro de conexão. Verifique sua internet.' }
        return updated
      })
    }
    setLoading(false)
  }

  function handleSend(q: string) {
    sendMessage(q, messages)
  }

  function removeDoc(name: string) {
    setUploadedDocs((prev) => prev.filter((d) => d.name !== name))
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files) {
      for (let i = 0; i < files.length; i++) {
        processFile(files[i])
      }
    }
    e.target.value = ''
  }

  // ── Shared elements ─────────────────────────────────────────────────
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf,application/pdf"
      multiple
      className="hidden"
      onChange={onFileSelected}
    />
  )

  const docChips = uploadedDocs.length > 0 && (
    <div className="flex flex-wrap gap-1.5">
      {uploadedDocs.map((doc) => (
        <span
          key={doc.name}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full"
        >
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {doc.name} ({doc.pages}p, {(doc.chars / 1000).toFixed(0)}k)
          <button onClick={() => removeDoc(doc.name)} className="ml-0.5 hover:text-red-600">x</button>
        </span>
      ))}
    </div>
  )

  const dragProps = {
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
  }

  // ── Drop overlay ────────────────────────────────────────────────────
  const dropOverlay = dragOver && (
    <div className="absolute inset-0 z-50 bg-brand/5 border-2 border-dashed border-brand rounded-xl flex items-center justify-center pointer-events-none">
      <div className="text-center">
        <svg className="w-10 h-10 text-brand mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <p className="text-sm font-medium text-brand">Solte o PDF aqui</p>
      </div>
    </div>
  )

  // ── State 0: No access (plan upgrade required) ──────────────────
  if (!hasAccess) {
    return (
      <Card className="border-gray-200 opacity-80">
        <CardContent className="py-6">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Chat com o Edital</h3>
              <p className="text-sm text-gray-500 mt-1">
                Converse com a IA sobre os documentos do edital e obtenha insights detalhados.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Disponivel nos planos Professional e Enterprise
              </p>
            </div>
            <a
              href="/billing"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand/10 text-brand rounded-lg text-sm font-medium hover:bg-brand/20 transition-colors"
            >
              Fazer upgrade
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── State 1: Not started ──────────────────────────────────────────
  if (!started) {
    return (
      <Card className={`border-brand/20 relative ${dragOver ? 'ring-2 ring-brand' : ''}`} {...dragProps}>
        {dropOverlay}
        <CardContent className="py-6">
          {fileInput}
          <div className="text-center space-y-3">
            <div className="w-12 h-12 bg-brand/10 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Chat com o Edital</h3>
              <p className="text-sm text-gray-500 mt-1">
                A IA vai analisar o edital completo e trazer os principais insights para você.
              </p>
              {documentCount > 0 && uploadedDocs.length === 0 && documentUrls.length > 0 && (
                <p className="text-xs text-emerald-600 bg-emerald-50 rounded-md px-3 py-1.5 mt-2 inline-block">
                  ✓ {documentUrls.length} documento{documentUrls.length > 1 ? 's' : ''} detectado{documentUrls.length > 1 ? 's' : ''} — será{documentUrls.length > 1 ? 'ão' : ''} carregado{documentUrls.length > 1 ? 's' : ''} automaticamente
                </p>
              )}
              {documentCount > 0 && uploadedDocs.length === 0 && documentUrls.length === 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-1.5 mt-2 inline-block">
                  Para melhor análise, baixe o PDF do edital acima e anexe aqui
                </p>
              )}
            </div>

            {docChips}

            <div className="flex flex-col items-center gap-2.5">
              {/* Upload area */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="w-full max-w-xs border-2 border-dashed border-gray-300 hover:border-brand rounded-lg p-4 transition-colors disabled:opacity-50 group"
              >
                {uploadingFile ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <svg className="w-6 h-6 animate-spin text-brand" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-xs text-brand font-medium">Lendo PDF...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <svg className="w-6 h-6 text-gray-400 group-hover:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span className="text-xs text-gray-500 group-hover:text-brand transition-colors font-medium">
                      Clique para anexar ou arraste o PDF aqui
                    </span>
                  </div>
                )}
              </button>

              <button
                onClick={handleStart}
                className="px-6 py-2.5 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors duration-150 font-medium text-sm inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Começar agora
              </button>
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── State 2: Chat started ─────────────────────────────────────────
  return (
    <Card className={`border-brand/20 relative ${dragOver ? 'ring-2 ring-brand' : ''}`} {...dragProps}>
      {dropOverlay}
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Chat com o Edital</span>
          {uploadedDocs.length > 0 && (
            <span className="text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              {uploadedDocs.length} PDF{uploadedDocs.length > 1 ? 's' : ''}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fileInput}

        {extractingDocs && (
          <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
            <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Baixando e lendo documentos do edital automaticamente...</span>
          </div>
        )}

        {uploadingFile && (
          <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
            <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Lendo PDF no navegador...</span>
          </div>
        )}

        {docChips}

        {/* Messages */}
        <div ref={messagesContainerRef} className="h-[250px] md:h-[350px] overflow-y-auto overscroll-contain space-y-3 border rounded-lg p-3 bg-gray-50">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                  msg.role === 'user' ? 'bg-brand text-white' : 'bg-white border text-gray-900'
                }`}
              >
                {msg.role === 'user' && msg.content === INITIAL_PROMPT ? (
                  <span className="italic text-white/80">Análise inicial do edital</span>
                ) : msg.content || (
                  <span className="inline-flex gap-1">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse" style={{ animationDelay: '150ms' }}>●</span>
                    <span className="animate-pulse" style={{ animationDelay: '300ms' }}>●</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</p>}

        {!loading && messages.length >= 2 && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSend(q)}
                className="text-xs px-2.5 py-1.5 bg-brand/5 border border-brand/20 rounded-full text-brand hover:bg-brand/10 transition-colors duration-150"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input row */}
        <form onSubmit={(e) => { e.preventDefault(); handleSend(input) }} className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md border text-gray-400 hover:text-brand hover:border-brand/30 transition-colors disabled:opacity-50"
            title="Anexar PDF"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte algo sobre este edital..."
            className="flex-1 h-9 rounded-md border px-3 text-sm bg-background"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-9 px-4 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors duration-150"
          >
            Enviar
          </button>
        </form>
      </CardContent>
    </Card>
  )
}
