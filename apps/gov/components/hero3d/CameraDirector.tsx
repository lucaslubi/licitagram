'use client'

/**
 * CameraDirector — controla a câmera principal interpolando entre os shots
 * definidos em CAMERA_SHOTS via easing power2.inOut. Usa GSAP para a curva
 * de easing e useFrame para amostrar `elapsed` do store.
 *
 * Single-camera approach (mais leve que múltiplas cameras + switching).
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { CAMERA_SHOTS, type CameraShot } from './constants'
import { useHero3DStore } from './useHero3DStore'

// power2.inOut — easing GSAP em forma de função pura (evita recalcular timeline)
function power2InOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function findShotPair(elapsed: number): [CameraShot, CameraShot, number] {
  for (let i = 0; i < CAMERA_SHOTS.length - 1; i++) {
    const a = CAMERA_SHOTS[i] as CameraShot
    const b = CAMERA_SHOTS[i + 1] as CameraShot
    if (elapsed >= a.t && elapsed <= b.t) {
      const span = b.t - a.t
      const local = span === 0 ? 0 : (elapsed - a.t) / span
      return [a, b, power2InOut(local)]
    }
  }
  const last = CAMERA_SHOTS[CAMERA_SHOTS.length - 1] as CameraShot
  return [last, last, 0]
}

const tmpV1 = new THREE.Vector3()
const tmpV2 = new THREE.Vector3()
const tmpLook = new THREE.Vector3()

export function CameraDirector() {
  const { camera } = useThree()
  const elapsedRef = useRef(0)

  useFrame((_, dt) => {
    // Lê o tempo do store (Zustand) sem se inscrever em re-renders
    const e = useHero3DStore.getState().elapsed
    elapsedRef.current = e

    const [a, b, k] = findShotPair(e)

    tmpV1.set(...a.pos)
    tmpV2.set(...b.pos)
    tmpV1.lerp(tmpV2, k)
    camera.position.copy(tmpV1)

    tmpV1.set(...a.look)
    tmpV2.set(...b.look)
    tmpLook.copy(tmpV1).lerp(tmpV2, k)
    camera.lookAt(tmpLook)

    if ('fov' in camera && a.fov && b.fov) {
      const fov = a.fov + (b.fov - a.fov) * k
      ;(camera as THREE.PerspectiveCamera).fov = fov
      ;(camera as THREE.PerspectiveCamera).updateProjectionMatrix()
    }
    // dt usado internamente pelo R3F; mantemos camera.fov coerente entre frames
    void dt
  })

  return null
}
