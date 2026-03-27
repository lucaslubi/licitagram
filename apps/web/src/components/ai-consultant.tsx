'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, X, Send, MessageCircle, FileDown, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useConsultantContext } from '@/contexts/consultant-context'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

/** Extract [GERAR_PDF:{...}] markers from assistant content.
 *  Uses greedy match on the JSON object braces so nested arrays/objects
 *  (like sections:[{...}]) don't break the extraction. */
function extractPdfMarker(content: string): { cleanContent: string; pdfPayload: Record<string, unknown> | null } {
  // Greedy: capture from first { to last } before the closing ]
  const regex = /\[GERAR_PDF:(\{[\s\S]*\})\]/
  const match = content.match(regex)
  if (!match) return { cleanContent: content, pdfPayload: null }
  try {
    const payload = JSON.parse(match[1]) as Record<string, unknown>
    const cleanContent = content.replace(regex, '').trim()
    return { cleanContent, pdfPayload: payload }
  } catch {
    return { cleanContent: content, pdfPayload: null }
  }
}

export function AiConsultant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [userHasScrolled, setUserHasScrolled] = useState(false)
  const [pdfExporting, setPdfExporting] = useState<number | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const lastAssistantRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { pageContext } = useConsultantContext()

  // When user sends a message, scroll to show the start of the assistant reply
  // During streaming, do NOT auto-scroll — let the user read from the top
  useEffect(() => {
    if (!loading || userHasScrolled) return
    // Scroll to the beginning of the last assistant message (not the end)
    lastAssistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Only do this once when streaming starts
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset userHasScrolled when user sends a new message
  useEffect(() => {
    if (loading) setUserHasScrolled(false)
  }, [loading])

  // Detect manual user scroll during streaming
  const handleScroll = useCallback(() => {
    if (!loading) return
    setUserHasScrolled(true)
  }, [loading])

  // Focus input when panel opens
  useEffect(() => {
    if (open && !loading) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, loading])

  // Clear unread when opening
  useEffect(() => {
    if (open) setUnreadCount(0)
  }, [open])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return

      const userMsg: Message = { role: 'user', content: trimmed }
      const updatedMessages = [...messages, userMsg]
      setMessages(updatedMessages)
      setInput('')
      setLoading(true)

      // Add empty assistant message for streaming
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      // Scroll to show the user message + beginning of assistant response
      setTimeout(() => {
        lastAssistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)

      try {
        const response = await fetch('/api/consultant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: updatedMessages,
            pageContext,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => null)
          const errorMsg =
            errorData?.error ||
            (response.status === 429
              ? 'Limite de requisições atingido. Aguarde um momento.'
              : 'Ocorreu um erro. Tente novamente.')
          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: errorMsg }
            return updated
          })
          setLoading(false)
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          setLoading(false)
          return
        }

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
              } catch {
                /* skip malformed chunks */
              }
            }
          }
        }

        // Increment unread if panel is closed
        if (!open) {
          setUnreadCount((prev) => prev + 1)
        }
      } catch {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: 'Erro de conexão. Verifique sua internet e tente novamente.',
          }
          return updated
        })
      }
      setLoading(false)
    },
    [loading, messages, pageContext, open],
  )

  async function handlePdfDownload(payload: Record<string, unknown>) {
    try {
      const response = await fetch('/api/consultant/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('PDF generation failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(payload.title as string) || 'relatorio'}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('Erro ao gerar o PDF. Tente novamente.')
    }
  }

  async function handleExportMessagePdf(content: string, index: number) {
    setPdfExporting(index)
    try {
      const lines = content.split('\n')
      const sections: Array<{ heading: string; content: string; type: 'text' | 'bullet'; items?: string[] }> = []
      let currentHeading = 'Resposta'
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
        sections.push({ heading: 'Resposta', content, type: 'text' })
      }

      const response = await fetch('/api/consultant/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Consultor IA Licitagram',
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
      a.download = `licitagram-consultor-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('Erro ao gerar o PDF. Tente novamente.')
    }
    setPdfExporting(null)
  }

  function handleCopyMessage(content: string, index: number) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    })
  }

  const suggestedQuestions = pageContext.suggestedQuestions || []

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          id="ai-consultant-button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full bg-[#F43E01] text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center group"
          aria-label="Abrir Consultor IA"
        >
          <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-0 right-0 md:bottom-6 md:right-6 z-[9999] w-full h-full md:w-[400px] md:h-auto md:max-h-[550px] bg-[#1a1c1f] md:rounded-2xl shadow-2xl border border-[#2d2f33] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#F43E01] to-[#F43E01] text-white shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              <h2 className="font-semibold text-sm">Consultor IA</h2>
              <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-medium">
                Licitagram
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages area */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#1a1c1f] min-h-0"
          >
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <div className="w-12 h-12 bg-orange-900/20 rounded-full flex items-center justify-center mx-auto">
                  <MessageCircle className="w-6 h-6 text-[#F43E01]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Olá! Sou seu Consultor IA
                  </p>
                  <p className="text-xs text-gray-400 mt-1 max-w-[280px] mx-auto">
                    Tire dúvidas sobre licitações, a plataforma, estratégias de participação e muito mais.
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => {
              const isUser = msg.role === 'user'
              const isLastAssistant = !isUser && i === messages.length - 1
              const { cleanContent, pdfPayload } = isUser
                ? { cleanContent: msg.content, pdfPayload: null }
                : extractPdfMarker(msg.content)

              return (
                <div
                  key={i}
                  ref={isLastAssistant ? lastAssistantRef : undefined}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl text-sm leading-relaxed ${
                      isUser
                        ? 'bg-[#F43E01] text-white px-4 py-2.5 rounded-br-md'
                        : 'bg-[#23262a] border border-[#2d2f33] shadow-sm px-4 py-3 text-gray-200 rounded-bl-md'
                    }`}
                  >
                    {isUser ? (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    ) : cleanContent ? (
                      <div className="prose prose-sm prose-invert max-w-none prose-headings:text-white prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5 prose-p:text-gray-300 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:text-gray-300 prose-li:my-0.5 prose-strong:text-white">
                        <ReactMarkdown>{cleanContent}</ReactMarkdown>
                      </div>
                    ) : (
                      /* Typing indicator for empty streaming message */
                      <div className="flex items-center gap-1.5 py-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}

                    {pdfPayload && (
                      <button
                        onClick={() => handlePdfDownload(pdfPayload)}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#F43E01] bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 hover:bg-orange-100 transition-colors"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        Baixar PDF
                      </button>
                    )}

                    {/* Action buttons for completed assistant messages */}
                    {!isUser && cleanContent && !loading && (
                      <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-gray-100">
                        {!pdfPayload && (
                          <button
                            onClick={() => handleExportMessagePdf(cleanContent, i)}
                            disabled={pdfExporting === i}
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-[#F43E01] rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
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
                        )}
                        <button
                          onClick={() => handleCopyMessage(cleanContent, i)}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-[#F43E01] rounded px-1.5 py-0.5 transition-colors"
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
            {/* Scroll anchor removed — we scroll to assistant message start, not end */}
          </div>

          {/* Suggested questions */}
          {!loading && messages.length === 0 && suggestedQuestions.length > 0 && (
            <div className="px-4 py-2 border-t border-[#2d2f33] bg-[#1a1c1f] shrink-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1.5">
                Sugestões
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="text-xs px-3 py-1.5 bg-orange-900/20 border border-orange-900/30 rounded-full text-orange-400 hover:bg-orange-900/30 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              sendMessage(input)
            }}
            className="flex items-center gap-2 px-4 py-3 border-t border-[#2d2f33] bg-[#1a1c1f] shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Faça uma pergunta..."
              className="flex-1 h-10 rounded-xl border border-[#2d2f33] px-4 text-sm text-white bg-[#23262a] placeholder:text-gray-500 focus:ring-2 focus:ring-[#F43E01]/20 focus:border-[#F43E01]/40 focus:bg-[#2d2f33] transition-all outline-none"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#F43E01] text-white hover:bg-[#d63501] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              aria-label="Enviar"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
