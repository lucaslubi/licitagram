'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ReactMarkdown from 'react-markdown'
import { FileDown, Copy, Check, CloudUpload } from 'lucide-react'
import { saveToDrive } from '@/lib/drive-utils'

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
  const [progressStep, setProgressStep] = useState(0)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const lastAssistantRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const [userHasScrolled, setUserHasScrolled] = useState(false)
  const [pdfExporting, setPdfExporting] = useState<number | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [driveSaving, setDriveSaving] = useState<number | null>(null)
  const [driveSaved, setDriveSaved] = useState<number | null>(null)

  // When loading starts (new message), scroll to show the TOP of the AI response
  // Do NOT continuously scroll as content streams in
  useEffect(() => {
    if (!loading || userHasScrolled) return
    // Scroll the last assistant message into view at the top
    messagesContainerRef.current?.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: 'smooth' })
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset userHasScrolled when user sends a new message (loading goes true)
  useEffect(() => {
    if (loading) setUserHasScrolled(false)
  }, [loading])

  // Detect manual user scroll during streaming
  const handleContainerScroll = useCallback(() => {
    if (!loading) return
    setUserHasScrolled(true)
  }, [loading])

  useEffect(() => {
    if (!loading && started) inputRef.current?.focus()
  }, [loading, started])

  // Lock body scroll when chat is active to prevent page from scrolling
  useEffect(() => {
    if (started) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [started])

  // Progress messages during AI analysis
  const PROGRESS_MESSAGES = [
    'Conectando ao servidor de IA...',
    'Baixando documentos do edital...',
    'Extraindo texto dos PDFs...',
    'Analisando requisitos técnicos...',
    'Verificando critérios de habilitação...',
    'Avaliando compatibilidade com sua empresa...',
    'Identificando pontos de atenção...',
    'Gerando análise estratégica...',
    'Finalizando parecer...',
  ]

  useEffect(() => {
    if (!loading) { setProgressStep(0); return }
    const interval = setInterval(() => {
      setProgressStep((prev) => Math.min(prev + 1, PROGRESS_MESSAGES.length - 1))
    }, 3000)
    return () => clearInterval(interval)
  }, [loading])

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

      // Scroll to show user message + start of AI response
      setTimeout(() => {
        messagesContainerRef.current?.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: 'smooth' })
      }, 50)

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

    // Scroll to show start of AI response
    setTimeout(() => {
      messagesContainerRef.current?.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: 'smooth' })
    }, 50)

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

  async function handleExportPdf(content: string, index: number) {
    setPdfExporting(index)
    try {
      // Parse markdown content into sections for the PDF template
      const lines = content.split('\n')
      const sections: Array<{ heading: string; content: string; type: 'text' | 'bullet'; items?: string[] }> = []
      let currentHeading = 'Análise'
      let currentLines: string[] = []

      for (const line of lines) {
        const headingMatch = line.match(/^#{1,3}\s+(.+)/)
        if (headingMatch) {
          if (currentLines.length > 0) {
            const items = currentLines.filter(l => l.match(/^[-•*]\s/))
            if (items.length > 2) {
              sections.push({ heading: currentHeading, content: '', type: 'bullet', items: items.map(l => l.replace(/^[-•*]\s+/, '')) })
            } else {
              sections.push({ heading: currentHeading, content: currentLines.join('\n'), type: 'text' })
            }
          }
          currentHeading = headingMatch[1].replace(/\*\*/g, '')
          currentLines = []
        } else if (line.trim()) {
          currentLines.push(line.replace(/\*\*/g, '').replace(/\*/g, ''))
        }
      }
      if (currentLines.length > 0) {
        const items = currentLines.filter(l => l.match(/^[-•*]\s/))
        if (items.length > 2) {
          sections.push({ heading: currentHeading, content: '', type: 'bullet', items: items.map(l => l.replace(/^[-•*]\s+/, '')) })
        } else {
          sections.push({ heading: currentHeading, content: currentLines.join('\n'), type: 'text' })
        }
      }

      if (sections.length === 0) {
        sections.push({ heading: 'Análise', content, type: 'text' })
      }

      const response = await fetch('/api/consultant/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Análise do Edital',
          subtitle: 'Consultor IA Licitagram',
          sections,
          metadata: {
            date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
          },
        }),
      })
      if (!response.ok) throw new Error('PDF generation failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `licitagram-analise-edital-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('Erro ao gerar o PDF. Tente novamente.')
    }
    setPdfExporting(null)
  }

  function handleCopy(content: string, index: number) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    })
  }

  async function handleSaveToDrive(content: string, index: number) {
    setDriveSaving(index)
    try {
      // Parse markdown into sections (same logic as PDF export)
      const lines = content.split('\n')
      const sections: Array<{ heading: string; content: string; type: 'text' | 'bullet'; items?: string[] }> = []
      let currentHeading = 'Analise'
      let currentLines: string[] = []

      for (const line of lines) {
        const headingMatch = line.match(/^#{1,3}\s+(.+)/)
        if (headingMatch) {
          if (currentLines.length > 0) {
            const items = currentLines.filter(l => l.match(/^[-\u2022*]\s/))
            if (items.length > 2) {
              sections.push({ heading: currentHeading, content: '', type: 'bullet', items: items.map(l => l.replace(/^[-\u2022*]\s+/, '')) })
            } else {
              sections.push({ heading: currentHeading, content: currentLines.join('\n'), type: 'text' })
            }
          }
          currentHeading = headingMatch[1].replace(/\*\*/g, '')
          currentLines = []
        } else if (line.trim()) {
          currentLines.push(line.replace(/\*\*/g, '').replace(/\*/g, ''))
        }
      }
      if (currentLines.length > 0) {
        const items = currentLines.filter(l => l.match(/^[-\u2022*]\s/))
        if (items.length > 2) {
          sections.push({ heading: currentHeading, content: '', type: 'bullet', items: items.map(l => l.replace(/^[-\u2022*]\s+/, '')) })
        } else {
          sections.push({ heading: currentHeading, content: currentLines.join('\n'), type: 'text' })
        }
      }
      if (sections.length === 0) {
        sections.push({ heading: 'Analise', content, type: 'text' })
      }

      // Generate PDF blob via the same API
      const response = await fetch('/api/consultant/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Analise do Edital',
          subtitle: 'Consultor IA Licitagram',
          sections,
          metadata: {
            date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
          },
        }),
      })
      if (!response.ok) throw new Error('PDF generation failed')
      const blob = await response.blob()

      const fileName = `licitagram-analise-edital-${new Date().toISOString().split('T')[0]}.pdf`
      const result = await saveToDrive({
        file: blob,
        fileName,
        category: 'consultor',
        description: 'Analise do Edital - Consultor IA',
        tenderId,
        tags: ['consultor', 'analise', 'edital'],
      })

      if (result.success) {
        setDriveSaved(index)
        setTimeout(() => setDriveSaved(null), 3000)
      } else {
        alert(result.error || 'Erro ao salvar no Drive.')
      }
    } catch {
      alert('Erro ao salvar no Drive. Tente novamente.')
    }
    setDriveSaving(null)
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
                Disponível nos planos Professional e Enterprise
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
      <Card className={`border-brand/30 bg-gradient-to-br from-white to-brand/5 shadow-lg relative ${dragOver ? 'ring-2 ring-brand' : ''}`} {...dragProps}>
        {dropOverlay}
        <CardContent className="py-8 px-6">
          {fileInput}
          <div className="text-center space-y-4">
            <div className="w-14 h-14 bg-brand/10 rounded-2xl flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Consultor IA do Edital</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-lg mx-auto">
                Análise estratégica completa com IA. Leitura integral do edital, identificação de riscos, requisitos e recomendações para vencer a licitação.
              </p>
              {documentCount > 0 && uploadedDocs.length === 0 && documentUrls.length > 0 && (
                <p className="text-xs text-emerald-600 bg-emerald-50 rounded-md px-3 py-1.5 mt-3 inline-block">
                  ✓ {documentUrls.length} documento{documentUrls.length > 1 ? 's' : ''} detectado{documentUrls.length > 1 ? 's' : ''} — será{documentUrls.length > 1 ? 'ão' : ''} carregado{documentUrls.length > 1 ? 's' : ''} automaticamente
                </p>
              )}
              {documentCount > 0 && uploadedDocs.length === 0 && documentUrls.length === 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-1.5 mt-3 inline-block">
                  Para melhor análise, baixe o PDF do edital acima e anexe aqui
                </p>
              )}
            </div>

            {docChips}

            <button
              onClick={handleStart}
              className="px-8 py-3 bg-brand text-white rounded-xl hover:bg-brand-dark transition-all duration-150 font-semibold text-sm inline-flex items-center gap-2 shadow-md hover:shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
              Iniciar Análise com IA
            </button>

            {error && <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── State 2: Chat started ─────────────────────────────────────────
  return (
    <Card className={`border-brand/30 shadow-lg relative ${dragOver ? 'ring-2 ring-brand' : ''}`} {...dragProps}>
      {dropOverlay}
      <CardHeader className="pb-2 bg-gradient-to-r from-brand/5 to-transparent rounded-t-lg">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="inline-flex items-center gap-2">
            <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            Consultor IA do Edital
          </span>
          <div className="flex items-center gap-2">
            {uploadedDocs.length > 0 && (
              <span className="text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                {uploadedDocs.length} PDF{uploadedDocs.length > 1 ? 's' : ''}
              </span>
            )}
            <span className="text-[10px] font-semibold text-brand/70 bg-brand/10 px-2 py-0.5 rounded-full tracking-wide uppercase">
              Licitagram AI
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        {fileInput}

        {extractingDocs && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-xs text-blue-800">
              <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="font-medium">{PROGRESS_MESSAGES[Math.min(progressStep, 2)]}</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-1">
              <div className="bg-blue-600 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(((progressStep + 1) / 3) * 100, 90)}%` }} />
            </div>
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

        {/* Messages — tall area for primary feature */}
        <div ref={messagesContainerRef} onScroll={handleContainerScroll} className="h-[350px] md:h-[500px] overflow-y-auto overscroll-contain space-y-4 border rounded-xl p-4 bg-gray-50/50">
          {messages.map((msg, i) => {
            const isAssistant = msg.role === 'assistant'
            const isLastAssistant = isAssistant && i === messages.length - 1

            return (
              <div
                key={i}
                ref={isLastAssistant ? lastAssistantRef : undefined}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-brand text-white px-4 py-2.5 whitespace-pre-wrap'
                      : 'bg-white border border-gray-200 shadow-sm px-4 py-3 text-gray-900'
                  }`}
                >
                  {msg.role === 'user' && msg.content === INITIAL_PROMPT ? (
                    <span className="italic text-white/80 inline-flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      Análise estratégica do edital
                    </span>
                  ) : isAssistant && msg.content ? (
                    <div className="prose prose-sm prose-gray max-w-none prose-headings:text-gray-900 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-strong:text-gray-900 prose-table:text-xs prose-th:bg-gray-50 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-th:border prose-td:border">
                      <ReactMarkdown
                        components={{
                          // Fix list items with emoji overlap
                          li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
                          // Suppress horizontal rules (AI often generates excessive ---)
                          hr: () => <div className="my-3" />,
                        }}
                      >
                        {msg.content
                          // Remove excessive horizontal rules (3+ dashes on a line)
                          .replace(/^-{3,}\s*$/gm, '')
                          // Remove lines that are ONLY dashes/dots/underscores (common AI artifacts)
                          .replace(/^[.\-_]{3,}\s*$/gm, '')
                          // Fix strikethrough emoji overlap: =✅ or =📋 artifacts
                          .replace(/[=+]([✅📋🔑📄⚠️🔥💰📊🏆✨💡🎯])/g, '$1')
                          // Collapse multiple blank lines into max 2
                          .replace(/\n{4,}/g, '\n\n\n')
                        }
                      </ReactMarkdown>
                    </div>
                  ) : msg.content ? (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  ) : (
                    <div className="w-full space-y-2">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin text-brand shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-xs text-gray-600 transition-all duration-300">
                          {PROGRESS_MESSAGES[progressStep]}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-brand to-orange-400 h-full rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${Math.min(((progressStep + 1) / PROGRESS_MESSAGES.length) * 100, 95)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400">
                        {progressStep < 3 ? 'Preparando análise...' : progressStep < 6 ? 'Processando documentos...' : 'Quase pronto...'}
                      </p>
                    </div>
                  )}

                  {/* Action buttons for completed assistant messages */}
                  {isAssistant && msg.content && !loading && (
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                      <button
                        onClick={() => handleExportPdf(msg.content, i)}
                        disabled={pdfExporting === i}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-brand bg-gray-50 hover:bg-brand/5 border border-gray-200 hover:border-brand/20 rounded-md px-2 py-1 transition-colors disabled:opacity-50"
                        title="Exportar como PDF"
                      >
                        {pdfExporting === i ? (
                          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <FileDown className="w-3 h-3" />
                        )}
                        PDF
                      </button>
                      <button
                        onClick={() => handleSaveToDrive(msg.content, i)}
                        disabled={driveSaving === i}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-brand bg-gray-50 hover:bg-brand/5 border border-gray-200 hover:border-brand/20 rounded-md px-2 py-1 transition-colors disabled:opacity-50"
                        title="Salvar no Drive"
                      >
                        {driveSaving === i ? (
                          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : driveSaved === i ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <CloudUpload className="w-3 h-3" />
                        )}
                        {driveSaved === i ? <span className="text-emerald-500">Salvo</span> : 'Drive'}
                      </button>
                      <button
                        onClick={() => handleCopy(msg.content, i)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-brand bg-gray-50 hover:bg-brand/5 border border-gray-200 hover:border-brand/20 rounded-md px-2 py-1 transition-colors"
                        title="Copiar texto"
                      >
                        {copiedIndex === i ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span className="text-emerald-500">Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copiar
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</p>}

        {!loading && messages.length >= 2 && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSend(q) }}
                type="button"
                className="text-xs px-3 py-1.5 bg-brand/5 border border-brand/20 rounded-full text-brand hover:bg-brand/10 transition-colors duration-150"
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
            className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border text-gray-400 hover:text-brand hover:border-brand/30 transition-colors disabled:opacity-50"
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
            placeholder="Pergunte sobre requisitos, riscos, estratégias..."
            className="flex-1 h-10 rounded-lg border px-4 text-sm bg-background focus:ring-2 focus:ring-brand/20 focus:border-brand/40 transition-all"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-10 px-5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors duration-150"
          >
            Enviar
          </button>
        </form>
      </CardContent>
    </Card>
  )
}
