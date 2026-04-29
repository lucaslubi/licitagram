'use client'

/**
 * Hero3DScene.client — wrapper com detecção de mobile, prefers-reduced-motion
 * e GPU. Faz lazy import do Canvas só quando hidratar.
 */

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { LoadingFallback } from './LoadingFallback'
import { useHero3DStore } from './useHero3DStore'
import { TOTAL_DURATION } from './constants'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

const Hero3DScene = dynamic(
  () => import('./Hero3DScene').then((m) => ({ default: m.Hero3DScene })),
  { ssr: false, loading: () => <LoadingFallback /> },
)

export default function Hero3DSceneClient() {
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const elapsed = useHero3DStore((s) => s.elapsed)
  const finished = useHero3DStore((s) => s.finished)

  useEffect(() => {
    setMounted(true)
    setIsMobile(window.innerWidth < 768)
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Headline aparece nos primeiros 1.5s e nos últimos 6s (finale)
  const showIntroOverlay = elapsed < 1.5
  const showFinaleOverlay = elapsed >= TOTAL_DURATION - 6 || finished

  return (
    <section className="relative h-[100vh] w-full overflow-hidden bg-[#0A1A3F]">
      {!mounted ? (
        <LoadingFallback />
      ) : (
        <Suspense fallback={<LoadingFallback />}>
          <Hero3DScene enablePostFX={!isMobile} reducedMotion={reducedMotion} />
        </Suspense>
      )}

      {/* Overlay HTML — gradiente de leitura */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(10,26,63,0.55) 0%, transparent 25%, transparent 70%, rgba(10,26,63,0.85) 100%)',
        }}
      />

      {/* Intro overlay (0–1.5s) */}
      {showIntroOverlay && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 px-6 text-center animate-[fade-in_0.6s_ease-out]">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#93C5FD]">
            LicitaGram Gov · Lei 14.133/2021
          </p>
          <h1 className="mt-4 text-4xl font-light text-white sm:text-6xl">
            <span className="bg-gradient-to-r from-[#93C5FD] via-white to-[#3B82F6] bg-clip-text text-transparent">
              A inteligência operacional
            </span>
            <br />
            do setor público brasileiro
          </h1>
        </div>
      )}

      {/* Finale overlay (24–30s) */}
      {showFinaleOverlay && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-6 pb-16 text-center animate-[fade-in-up_0.8s_ease-out]">
          <p className="text-pretty text-base text-white/85 sm:text-lg max-w-2xl">
            A inteligência operacional do setor público brasileiro.
          </p>
          <Link
            href="/cadastro"
            className="pointer-events-auto mt-6 inline-flex h-12 items-center justify-center rounded-lg bg-gradient-to-r from-[#3B82F6] to-[#1E40AF] px-7 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:brightness-110"
          >
            Solicitar acesso antecipado
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <p className="mt-3 text-xs text-white/50">
            Beta gratuito de lançamento · sem cartão · SSO Gov.br em breve
          </p>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  )
}
