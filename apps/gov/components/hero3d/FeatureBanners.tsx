'use client'

/**
 * FeatureBanners — letreiros 3D sincronizados com a timeline.
 *
 * Usa drei <Html transform> pra nitidez perfeita do texto.
 * Anima opacity/translateY com CSS (sem GSAP no overlay).
 */

import { Html } from '@react-three/drei'
import { useEffect, useState } from 'react'
import {
  Sparkles,
  ShieldCheck,
  Workflow,
  FileSearch,
  Eye,
  Network,
  Scale,
  GitBranch,
  type LucideIcon,
} from 'lucide-react'
import { BANNERS } from './constants'
import { useHero3DStore } from './useHero3DStore'

const ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  shield: ShieldCheck,
  workflow: Workflow,
  search: FileSearch,
  eye: Eye,
  network: Network,
  scale: Scale,
  branch: GitBranch,
}

const ENTER_MS = 600
const EXIT_MS = 400

export function FeatureBanners() {
  const elapsed = useHero3DStore((s) => s.elapsed)

  return (
    <>
      {BANNERS.map((b, idx) => {
        const dt = elapsed - b.t
        const visible = dt >= -ENTER_MS / 1000 && dt <= b.duration + EXIT_MS / 1000
        if (!visible) return null
        // 3 fases: enter (fade+slide-down), hold, exit (fade+slide-up)
        let opacity = 0
        let y = 0
        if (dt < 0) {
          // antes do start: pre-roll? (we entered when dt >= -enter/1000 so -enter..0 = enter)
          const k = (dt + ENTER_MS / 1000) / (ENTER_MS / 1000)
          opacity = k
          y = (1 - k) * -20
        } else if (dt < b.duration) {
          opacity = 1
          y = 0
        } else {
          const k = (dt - b.duration) / (EXIT_MS / 1000)
          opacity = 1 - k
          y = k * 20
        }
        const Icon = ICON_MAP[b.icon] ?? Sparkles
        return (
          <Html
            key={idx}
            position={b.position}
            center
            transform
            occlude={false}
            style={{ pointerEvents: 'none' }}
          >
            <div
              className="rounded-xl border px-5 py-3 shadow-2xl backdrop-blur-md"
              style={{
                background: 'rgba(10, 26, 63, 0.85)',
                borderColor: '#3B82F6',
                boxShadow: '0 0 40px rgba(59, 130, 246, 0.35)',
                transform: `translate3d(0, ${y}px, 0)`,
                opacity,
                transition: 'opacity 50ms linear, transform 50ms linear',
                minWidth: 280,
                fontFamily: 'Inter, ui-sans-serif, system-ui',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'rgba(59, 130, 246, 0.2)' }}
                >
                  <Icon className="h-4 w-4" style={{ color: '#93C5FD' }} />
                </div>
                <p
                  className="text-sm font-semibold tracking-tight text-white"
                  style={{ letterSpacing: '-0.02em' }}
                >
                  {b.text}
                </p>
              </div>
            </div>
          </Html>
        )
      })}
    </>
  )
}

// no-op: hint de hot-reload
export function _bannersBootstrap() {
  if (typeof window !== 'undefined') {
    void useHero3DStore.getState().elapsed
  }
}

void useEffect
void useState
