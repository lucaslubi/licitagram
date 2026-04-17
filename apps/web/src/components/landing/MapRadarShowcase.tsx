'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * MapRadarShowcase — top-tier showcase of the Licitagram Geographic Radar.
 *
 * Uses the REAL recording of /map in production (public/videos/demo-mapa.mp4).
 * Wraps it in a premium chrome: macOS traffic lights, live URL bar, pulsing
 * LIVE indicator, CountUp stat overlays floating on the corners, animated
 * gradient border, and 3 capability badges.
 *
 * Everything plays autoplay-muted so it's mobile-safe and doesn't require
 * user interaction to show the live feel.
 */

function useInView<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (!ref.current || inView) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true)
      },
      { threshold: 0.2 },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [inView])
  return { ref, inView }
}

function CountUp({
  to,
  prefix = '',
  suffix = '',
  durationMs = 2200,
  startWhen,
}: {
  to: number
  prefix?: string
  suffix?: string
  durationMs?: number
  startWhen: boolean
}) {
  const [value, setValue] = useState(0)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!startWhen || startedRef.current) return
    startedRef.current = true
    const start = performance.now()
    let raf = 0
    function frame(now: number) {
      const elapsed = now - start
      const progress = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.floor(to * eased))
      if (progress < 1) raf = requestAnimationFrame(frame)
      else setValue(to)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [to, durationMs, startWhen])

  return (
    <span className="font-mono tabular-nums">
      {prefix}
      {value.toLocaleString('pt-BR')}
      {suffix}
    </span>
  )
}

export function MapRadarShowcase() {
  const { ref, inView } = useInView<HTMLDivElement>()

  return (
    <section
      id="mapa-radar"
      className="relative overflow-hidden border-y border-white/[0.06]"
      style={{
        background:
          'radial-gradient(ellipse at top, rgba(244,62,1,0.08) 0%, transparent 45%), linear-gradient(180deg, #0A0A0F 0%, #050506 100%)',
      }}
    >
      {/* Scanline + grid */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
        aria-hidden
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 relative">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <p className="font-mono text-[10px] sm:text-xs uppercase text-[#F43E01] tracking-[0.24em] mb-4">
            Radar geográfico · exclusivo Licitagram
          </p>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold text-white tracking-tight leading-[1.05]">
            O único mapa de licitações do Brasil.
          </h2>
          <p className="text-lg text-white/60 mt-5 max-w-2xl mx-auto leading-relaxed">
            Cada pregão do país, em tempo real, georreferenciado. Filtros por UF, órgão,
            valor e modalidade. <strong className="text-white">Ninguém mais fez isso.</strong>
          </p>
        </div>

        {/* Map video with premium chrome */}
        <div ref={ref} className="relative max-w-5xl mx-auto">
          {/* Browser chrome */}
          <div className="relative rounded-2xl overflow-hidden bg-[#0F0F14] border border-white/[0.08] shadow-[0_40px_80px_-24px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)_inset]">
            {/* macOS-style title bar */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06] bg-[#0A0A0F]">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
              </div>
              <div className="flex-1 mx-4 flex items-center justify-center">
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-md px-3 py-1 flex items-center gap-2 min-w-0 max-w-md w-full">
                  <svg className="w-3 h-3 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0-1.105.895-2 2-2s2 .895 2 2-.895 2-2 2-2-.895-2-2zm-6 0c0-1.105.895-2 2-2s2 .895 2 2-.895 2-2 2-2-.895-2-2z" />
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                  </svg>
                  <span className="font-mono text-[11px] text-white/60 truncate">
                    licitagram.com/map
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-md">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-emerald-400 font-semibold">
                  live
                </span>
              </div>
            </div>

            {/* Video — natural aspect ratio (no cropping) */}
            <div className="relative bg-black">
              <video
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="block w-full h-auto"
                poster="/videos/map-poster.jpg"
              >
                <source src="/videos/demo-mapa.mp4" type="video/mp4" />
                <source src="/videos/demo-mapa.webm" type="video/webm" />
              </video>

              {/* Overlay badges — floating on the video corners */}
              <div className="absolute top-4 left-4 bg-[#0A0A0F]/80 backdrop-blur-md border border-white/[0.08] rounded-lg px-3 py-2 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-[#F43E01]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                <span className="font-mono text-[10px] uppercase tracking-widest text-white/80 font-semibold">
                  27 UFs
                </span>
              </div>

              <div className="absolute top-4 right-4 bg-[#0A0A0F]/80 backdrop-blur-md border border-white/[0.08] rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F43E01] opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#F43E01]" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-white/80 font-semibold">
                  Tempo real
                </span>
              </div>

              {/* Floating stat pills — bottom */}
              <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-[#0A0A0F]/85 backdrop-blur-md border border-white/[0.08] rounded-lg px-2.5 py-2 sm:px-3 sm:py-2.5">
                  <p className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.14em] text-white/40 mb-0.5">
                    Licitações
                  </p>
                  <p className="text-sm sm:text-lg font-semibold text-white tracking-tight">
                    <CountUp to={2487234} startWhen={inView} />
                  </p>
                </div>
                <div className="bg-[#0A0A0F]/85 backdrop-blur-md border border-white/[0.08] rounded-lg px-2.5 py-2 sm:px-3 sm:py-2.5">
                  <p className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.14em] text-white/40 mb-0.5">
                    Abertos agora
                  </p>
                  <p className="text-sm sm:text-lg font-semibold text-emerald-400 tracking-tight">
                    <CountUp to={1847} startWhen={inView} />
                  </p>
                </div>
                <div className="bg-[#0A0A0F]/85 backdrop-blur-md border border-white/[0.08] rounded-lg px-2.5 py-2 sm:px-3 sm:py-2.5">
                  <p className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.14em] text-white/40 mb-0.5">
                    Valor 30d
                  </p>
                  <p className="text-sm sm:text-lg font-semibold text-white tracking-tight">
                    R$ <CountUp to={42} startWhen={inView} /> bi
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Capability strip below video */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 max-w-5xl mx-auto mt-8">
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 hover:border-[#F43E01]/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#F43E01]/10 border border-[#F43E01]/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[#F43E01]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white mb-1">Heatmap de oportunidade</h3>
                <p className="text-xs text-white/55 leading-relaxed">
                  Densidade de licitações compatíveis com sua empresa, por região. Priorize onde vale estar.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 hover:border-[#F43E01]/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white mb-1">Drill-down por município</h3>
                <p className="text-xs text-white/55 leading-relaxed">
                  Clique em qualquer estado e explore cidade por cidade. Órgão, valor, prazo.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 hover:border-[#F43E01]/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white mb-1">Score IA em cada pin</h3>
                <p className="text-xs text-white/55 leading-relaxed">
                  Matching semântico pgvector: cada pregão traz seu score de compatibilidade calculado.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <a
            href="/register"
            className="inline-flex items-center gap-2 bg-[#F43E01] text-white rounded-full px-7 py-3.5 text-sm font-semibold hover:bg-[#D63500] transition-all shadow-[0_10px_30px_-5px_rgba(244,62,1,0.5)]"
          >
            Entrar no mapa — 7 dias grátis
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </div>
      </div>

    </section>
  )
}
