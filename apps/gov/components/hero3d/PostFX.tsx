'use client'

/**
 * PostFX — Bloom + DoF + ChromaticAberration + Vignette.
 * Desabilitado em mobile via prop `enabled`.
 */

import {
  EffectComposer,
  Bloom,
  DepthOfField,
  ChromaticAberration,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Vector2 } from 'three'
import { useMemo } from 'react'

export function PostFX({ enabled = true }: { enabled?: boolean }) {
  const caOffset = useMemo(() => new Vector2(0.0005, 0.0005), [])
  if (!enabled) return null
  return (
    <EffectComposer multisampling={4}>
      <Bloom intensity={0.4} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
      <DepthOfField focusDistance={0.012} focalLength={0.02} bokehScale={2} />
      <ChromaticAberration
        offset={caOffset}
        radialModulation={false}
        modulationOffset={0}
        blendFunction={BlendFunction.NORMAL}
      />
      <Vignette offset={0.3} darkness={0.5} />
    </EffectComposer>
  )
}
