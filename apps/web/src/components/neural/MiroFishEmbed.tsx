'use client'

import { useState } from 'react'

interface MiroFishEmbedProps {
  /** Base URL of the MiroFish frontend */
  baseUrl?: string
  /** Initial route/hash to navigate to */
  initialRoute?: string
  /** Height of the iframe */
  height?: number
  className?: string
}

/**
 * MiroFishEmbed — Embeds the full MiroFish Vue.js frontend inside Licitagram.
 * The MiroFish frontend runs on KVM8:3000 and connects to the Flask backend on KVM8:5001.
 * This gives users the EXACT MiroFish experience (all 5 steps, graph panel,
 * simulation, report viewer, interaction chat) styled within Licitagram's layout.
 */
export function MiroFishEmbed({
  baseUrl = 'http://187.77.241.93:3000',
  initialRoute = '',
  height = 700,
  className,
}: MiroFishEmbedProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  return (
    <div className={`bg-[#111214] border border-zinc-800 rounded-xl overflow-hidden ${className || ''}`}>
      {/* Header bar with Licitagram branding */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-[#0d0e10]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-emerald-600/20 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <div>
            <h3 className="text-white text-sm font-semibold">MiroFish Neural Engine</h3>
            <p className="text-gray-500 text-[10px]">Motor preditivo multi-agente integrado ao Licitagram</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <div className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
              Carregando...
            </div>
          )}
          <a
            href={baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded border border-zinc-700 hover:border-zinc-600 transition-colors"
          >
            Abrir completo ↗
          </a>
        </div>
      </div>

      {/* MiroFish iframe */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-red-600/20 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className="text-gray-400 text-sm">MiroFish nao esta acessivel</p>
          <p className="text-gray-500 text-xs mt-1">Verifique se o servico esta rodando no servidor</p>
        </div>
      ) : (
        <iframe
          src={`${baseUrl}${initialRoute ? '#' + initialRoute : ''}`}
          width="100%"
          height={height}
          style={{ border: 'none', background: '#0a0a0a' }}
          onLoad={() => setLoading(false)}
          onError={() => { setError(true); setLoading(false) }}
          allow="clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      )}
    </div>
  )
}
