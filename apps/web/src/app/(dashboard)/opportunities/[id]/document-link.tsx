'use client'

export function AnalyzeWithAIButton() {
  return (
    <button
      onClick={() => {
        const chatEl = document.getElementById('edital-chat')
        if (chatEl) chatEl.scrollIntoView({ behavior: 'smooth' })
      }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/20 text-amber-400 hover:bg-amber-200 transition cursor-pointer"
    >
      Analisar com IA
    </button>
  )
}
