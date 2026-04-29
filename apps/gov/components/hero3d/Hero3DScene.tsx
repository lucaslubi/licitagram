'use client'

/**
 * Hero3DScene — raiz do Canvas R3F.
 *
 * - Avança elapsed via useFrame
 * - Crossfade entre cenários por `Suspense` + opacity (group fade)
 * - Personagem único, outfit muda com a cena
 * - Banners + Camera Director + PostFX
 */

import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { ACESFilmicToneMapping } from 'three'
import { useHero3DStore } from './useHero3DStore'
import { TOTAL_DURATION, SCENE_TIMINGS, type SceneId } from './constants'
import { Character } from './Character'
import { CameraDirector } from './CameraDirector'
import { FeatureBanners } from './FeatureBanners'
import { PostFX } from './PostFX'
import { ArmyScene } from './environments/ArmyScene'
import { AirForceScene } from './environments/AirForceScene'
import { CityHallScene } from './environments/CityHallScene'
import { FederalScene } from './environments/FederalScene'
import { BrazilFinaleScene } from './environments/BrazilFinaleScene'

function TimelineDriver() {
  const setElapsed = useHero3DStore((s) => s.setElapsed)
  const startRef = useRef<number | null>(null)
  useFrame(({ clock }) => {
    if (startRef.current === null) startRef.current = clock.getElapsedTime()
    const t = Math.min(TOTAL_DURATION, clock.getElapsedTime() - startRef.current)
    setElapsed(t)
  })
  return null
}

function gestureForScene(scene: SceneId): 'salute' | 'sky' | 'wave' | 'tie' | null {
  switch (scene) {
    case 'army': return 'salute'
    case 'airforce': return 'sky'
    case 'cityhall': return 'wave'
    case 'federal': return 'tie'
    default: return null
  }
}

function sceneOpacity(elapsed: number, id: SceneId): number {
  const cfg = SCENE_TIMINGS[id]
  const fade = 0.7 // segundos de crossfade
  if (elapsed < cfg.start - fade) return 0
  if (elapsed < cfg.start) return (elapsed - (cfg.start - fade)) / fade
  if (elapsed < cfg.end) return 1
  if (elapsed < cfg.end + fade) return 1 - (elapsed - cfg.end) / fade
  return 0
}

function SceneStack() {
  const elapsed = useHero3DStore((s) => s.elapsed)
  const scene = useHero3DStore((s) => s.scene)

  return (
    <>
      <group visible={sceneOpacity(elapsed, 'army') > 0}>
        <ArmyScene />
      </group>
      <group visible={sceneOpacity(elapsed, 'airforce') > 0}>
        <AirForceScene />
      </group>
      <group visible={sceneOpacity(elapsed, 'cityhall') > 0}>
        <CityHallScene />
      </group>
      <group visible={sceneOpacity(elapsed, 'federal') > 0}>
        <FederalScene />
      </group>
      <group visible={sceneOpacity(elapsed, 'finale') > 0}>
        <BrazilFinaleScene />
      </group>

      {/* Personagem único — outfit pela cena ativa */}
      <Character
        scene={scene}
        walking={scene !== 'finale'}
        gesture={gestureForScene(scene)}
        elapsed={elapsed}
      />
    </>
  )
}

type Props = {
  enablePostFX?: boolean
  reducedMotion?: boolean
}

export function Hero3DScene({ enablePostFX = true, reducedMotion = false }: Props) {
  const skip = useHero3DStore((s) => s.skip)
  const finished = useHero3DStore((s) => s.finished)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (reducedMotion) skip()
  }, [reducedMotion, skip])

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{
          antialias: true,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          powerPreference: 'high-performance',
        }}
        camera={{ position: [0, 6, 14], fov: 50, near: 0.1, far: 200 }}
      >
        <color attach="background" args={['#0A1A3F']} />
        <fog attach="fog" args={['#0A1A3F', 25, 90]} />

        <Suspense fallback={null}>
          <SceneStack />
          <FeatureBanners />
          <CameraDirector />
          <TimelineDriver />
          <PostFX enabled={enablePostFX && !reducedMotion} />
        </Suspense>
      </Canvas>

      {/* Skip button */}
      {mounted && !finished && (
        <button
          onClick={() => skip()}
          className="absolute bottom-6 right-6 z-10 rounded-full border border-white/15 bg-slate-900/70 px-4 py-2 text-xs font-medium text-white/80 backdrop-blur-md transition hover:border-white/30 hover:text-white"
        >
          Pular animação →
        </button>
      )}
    </div>
  )
}
