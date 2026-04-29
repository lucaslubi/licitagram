'use client'

/**
 * LoadingFallback — poster estático CSS-only enquanto o canvas hidrata.
 * Sem download de JPG: gradientes + grid sutil. ~0KB extra.
 */

export function LoadingFallback() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0A1A3F]">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.25), transparent 55%), radial-gradient(ellipse at 70% 80%, rgba(16,43,94,0.6), transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(147,197,253,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(147,197,253,0.06) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        }}
      />
      <div className="absolute inset-x-0 bottom-1/3 flex justify-center">
        <div className="h-[2px] w-40 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#93C5FD] to-transparent"
            style={{ animation: 'loading-slide 1.4s ease-in-out infinite' }}
          />
        </div>
      </div>
      <style>{`
        @keyframes loading-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  )
}
