'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, X, Send, MessageCircle, FileDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useConsultantContext } from '@/contexts/consultant-context'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

/** Extract [GERAR_PDF:{...}] markers from assistant content */
function extractPdfMarker(content: string): { cleanContent: string; pdfPayload: Record<string, unknown> | null } {
  const regex = /\[GERAR_PDF:([\s\S]*?)\]/
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { pageContext } = useConsultantContext()

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  const suggestedQuestions = pageContext.suggestedQuestions || []

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          id="ai-consultant-button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full bg-[#F97316] text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center group"
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
        <div className="fixed bottom-0 right-0 md:bottom-6 md:right-6 z-[9999] w-full h-full md:w-[400px] md:h-auto md:max-h-[550px] bg-white md:rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#F97316] to-orange-500 text-white shrink-0">
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
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 min-h-0">
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                  <MessageCircle className="w-6 h-6 text-[#F97316]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Olá! Sou seu Consultor IA
                  </p>
                  <p className="text-xs text-gray-500 mt-1 max-w-[280px] mx-auto">
                    Tire dúvidas sobre licitações, a plataforma, estratégias de participação e muito mais.
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => {
              const isUser = msg.role === 'user'
              const { cleanContent, pdfPayload } = isUser
                ? { cleanContent: msg.content, pdfPayload: null }
                : extractPdfMarker(msg.content)

              return (
                <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl text-sm leading-relaxed ${
                      isUser
                        ? 'bg-[#F97316] text-white px-4 py-2.5 rounded-br-md'
                        : 'bg-white border border-gray-200 shadow-sm px-4 py-3 text-gray-900 rounded-bl-md'
                    }`}
                  >
                    {isUser ? (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    ) : cleanContent ? (
                      <div className="prose prose-sm prose-gray max-w-none prose-headings:text-gray-900 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:text-gray-900">
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
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#F97316] bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 hover:bg-orange-100 transition-colors"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        Baixar PDF
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested questions */}
          {!loading && messages.length === 0 && suggestedQuestions.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 bg-white shrink-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1.5">
                Sugestões
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="text-xs px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-full text-[#F97316] hover:bg-orange-100 transition-colors"
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
            className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 bg-white shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Faça uma pergunta..."
              className="flex-1 h-10 rounded-xl border border-gray-300 px-4 text-sm bg-gray-50 focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/40 focus:bg-white transition-all outline-none"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#F97316] text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
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
