'use client'

/**
 * Character — personagem procedural rigado-look.
 *
 * Geometria simples (capsule + box) com animação de caminhada via senoides
 * em pernas/braços. Outfit muda apenas o material conforme a cena.
 *
 * Substituível por GLB Ready Player Me / Mixamo: trocar o useFrame por
 * AnimationMixer e plugar mesh em /public/models/character.glb.
 */

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { OUTFITS, type SceneId } from './constants'

type Props = {
  scene: SceneId
  walking?: boolean
  gesture?: 'salute' | 'sky' | 'wave' | 'tie' | null
  elapsed: number
}

export function Character({ scene, walking = true, gesture, elapsed }: Props) {
  const group = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Mesh>(null)
  const legR = useRef<THREE.Mesh>(null)
  const armL = useRef<THREE.Mesh>(null)
  const armR = useRef<THREE.Mesh>(null)
  const body = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Group>(null)
  const tieRef = useRef<THREE.Mesh>(null)

  const outfit = OUTFITS[scene]

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (!group.current) return

    // Walk-on-spot (a ilusão vem da câmera + ground rolando)
    if (walking) {
      const phase = t * 5
      if (legL.current) legL.current.rotation.x = Math.sin(phase) * 0.6
      if (legR.current) legR.current.rotation.x = -Math.sin(phase) * 0.6
      if (armL.current) armL.current.rotation.x = -Math.sin(phase) * 0.5
      if (armR.current) armR.current.rotation.x = Math.sin(phase) * 0.5
      if (body.current) body.current.position.y = 1.2 + Math.abs(Math.sin(phase * 2)) * 0.04
    }

    // Gestures âncora — sobrepõem o ciclo de caminhada brevemente
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.6) * 0.12
    }
    if (gesture === 'salute' && armR.current) {
      armR.current.rotation.x = -Math.PI * 0.55
      armR.current.rotation.z = -0.4
    }
    if (gesture === 'sky' && head.current) {
      head.current.rotation.x = -0.4
    }
    if (gesture === 'wave' && armR.current) {
      armR.current.rotation.x = -Math.PI * 0.4
      armR.current.rotation.z = Math.sin(t * 8) * 0.3
    }
    if (gesture === 'tie' && armR.current) {
      armR.current.rotation.x = -Math.PI * 0.35
      armR.current.rotation.z = -0.2
    }
  })

  return (
    <group ref={group} position={[0, 0, 0]} castShadow>
      {/* Body — torso */}
      <mesh ref={body} position={[0, 1.2, 0]} castShadow>
        <capsuleGeometry args={[0.5, 1.2, 6, 12]} />
        <meshStandardMaterial color={outfit.primary} roughness={0.55} metalness={0.05} />
      </mesh>

      {/* Trim/lapela ou cinto */}
      <mesh position={[0, 1.6, 0.51]} castShadow>
        <boxGeometry args={[0.6, 0.15, 0.05]} />
        <meshStandardMaterial color={outfit.trim} roughness={0.4} metalness={0.3} />
      </mesh>

      {/* Cinto/divisor */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[1.05, 0.12, 1.05]} />
        <meshStandardMaterial color={outfit.accent} roughness={0.5} />
      </mesh>

      {/* Gravata (apenas em terno: cityhall/federal/finale) */}
      {(scene === 'cityhall' || scene === 'federal' || scene === 'finale') && (
        <mesh ref={tieRef} position={[0, 1.4, 0.52]} castShadow>
          <boxGeometry args={[0.18, 0.7, 0.06]} />
          <meshStandardMaterial
            color={scene === 'federal' || scene === 'finale' ? '#7B1E2B' : '#1E40AF'}
            roughness={0.3}
            metalness={0.1}
          />
        </mesh>
      )}

      {/* Brevê dourado (aeronáutica) */}
      {scene === 'airforce' && (
        <mesh position={[0.25, 1.7, 0.52]}>
          <boxGeometry args={[0.18, 0.08, 0.04]} />
          <meshStandardMaterial color={outfit.trim} metalness={0.9} roughness={0.2} />
        </mesh>
      )}

      {/* Pin bandeira BR (federal/finale) */}
      {(scene === 'federal' || scene === 'finale') && (
        <mesh position={[-0.25, 1.7, 0.52]}>
          <boxGeometry args={[0.1, 0.08, 0.03]} />
          <meshStandardMaterial color="#009C3B" emissive="#009C3B" emissiveIntensity={0.2} />
        </mesh>
      )}

      {/* Cabeça */}
      <group ref={head} position={[0, 2.35, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.38, 24, 24]} />
          <meshStandardMaterial color="#d8b48a" roughness={0.7} />
        </mesh>
        {/* Cabelo */}
        <mesh position={[0, 0.18, -0.05]}>
          <sphereGeometry args={[0.4, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#2a1a0d" roughness={0.9} />
        </mesh>
        {/* Boina/quepe (army/airforce) */}
        {(scene === 'army' || scene === 'airforce') && (
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.42, 0.44, 0.18, 16]} />
            <meshStandardMaterial color={outfit.accent} roughness={0.6} />
          </mesh>
        )}
        {/* Olhos */}
        <mesh position={[-0.12, 0.02, 0.34]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color="#0b1020" />
        </mesh>
        <mesh position={[0.12, 0.02, 0.34]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color="#0b1020" />
        </mesh>
      </group>

      {/* Braços */}
      <mesh ref={armL} position={[-0.6, 1.7, 0]} castShadow>
        <capsuleGeometry args={[0.13, 1, 4, 8]} />
        <meshStandardMaterial color={outfit.primary} roughness={0.55} />
      </mesh>
      <mesh ref={armR} position={[0.6, 1.7, 0]} castShadow>
        <capsuleGeometry args={[0.13, 1, 4, 8]} />
        <meshStandardMaterial color={outfit.primary} roughness={0.55} />
      </mesh>

      {/* Pernas */}
      <mesh ref={legL} position={[-0.22, 0.5, 0]} castShadow>
        <boxGeometry args={[0.28, 0.95, 0.28]} />
        <meshStandardMaterial color={outfit.accent} roughness={0.6} />
      </mesh>
      <mesh ref={legR} position={[0.22, 0.5, 0]} castShadow>
        <boxGeometry args={[0.28, 0.95, 0.28]} />
        <meshStandardMaterial color={outfit.accent} roughness={0.6} />
      </mesh>

      {/* Sapatos / coturno */}
      <mesh position={[-0.22, 0.05, 0.05]} castShadow>
        <boxGeometry args={[0.32, 0.1, 0.45]} />
        <meshStandardMaterial color="#0a0a14" roughness={0.4} />
      </mesh>
      <mesh position={[0.22, 0.05, 0.05]} castShadow>
        <boxGeometry args={[0.32, 0.1, 0.45]} />
        <meshStandardMaterial color="#0a0a14" roughness={0.4} />
      </mesh>

      {/* Halo no chão (sutil) */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.95, 32]} />
        <meshBasicMaterial color={outfit.trim} transparent opacity={0.18} />
      </mesh>
    </group>
  )
}
