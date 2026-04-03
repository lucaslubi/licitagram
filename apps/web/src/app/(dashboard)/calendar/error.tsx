'use client'

export default function CalendarError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="text-center py-12">
      <p className="text-red-400 text-sm mb-4">Erro ao carregar a agenda</p>
      <button onClick={reset} className="px-4 py-2 bg-[#2d2f33] text-white rounded-lg text-sm hover:bg-[#3d3f43]">
        Tentar novamente
      </button>
    </div>
  )
}
