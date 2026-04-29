'use client'

/**
 * MissionGate — esconde o conteúdo do landing até o usuário completar
 * a missão 3D (ou pular). Persistência via sessionStorage para não
 * forçar a missão em cada navegação interna na mesma sessão.
 */

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const Hero3DGame = dynamic(
  () => import('./Hero3DGame').then((m) => ({ default: m.Hero3DGame })),
  { ssr: false },
)

const STORAGE_KEY = 'gov-mission-completed-v1'

export function MissionGate({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [missionDone, setMissionDone] = useState(false)

  useEffect(() => {
    try {
      const flag = sessionStorage.getItem(STORAGE_KEY)
      if (flag === '1') setMissionDone(true)
    } catch {
      /* sessionStorage indisponível: missão é exibida normalmente */
    }
    setHydrated(true)
  }, [])

  const handleComplete = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setMissionDone(true)
  }

  // Antes de hidratar, render apenas placeholder escuro (evita flash do site)
  if (!hydrated) {
    return <div className="min-h-screen bg-[#0B1120]" />
  }

  if (!missionDone) {
    return <Hero3DGame onComplete={handleComplete} />
  }

  return <>{children}</>
}
