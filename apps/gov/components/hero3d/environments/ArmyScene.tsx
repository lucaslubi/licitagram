'use client'

/**
 * Exército — pátio de quartel ao amanhecer azulado.
 * Geometria procedural; sem logos oficiais (designs genéricos).
 */

import { COLORS } from '../constants'

export function ArmyScene() {
  return (
    <group>
      {/* Chão de concreto */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#1a2236" roughness={0.95} />
      </mesh>

      {/* Trilha central iluminada */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -2]}>
        <planeGeometry args={[6, 60]} />
        <meshStandardMaterial color="#243250" roughness={0.85} />
      </mesh>

      {/* Portão / parede ao fundo */}
      <mesh position={[0, 4, -18]} castShadow receiveShadow>
        <boxGeometry args={[24, 8, 1]} />
        <meshStandardMaterial color="#2a3344" roughness={0.85} />
      </mesh>

      {/* Brasão estilizado (genérico) — losango azul gelo */}
      <mesh position={[0, 5.5, -17.4]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[1.5, 1.5, 0.1]} />
        <meshStandardMaterial color={COLORS.iceBlue} emissive={COLORS.iceBlue} emissiveIntensity={0.25} />
      </mesh>

      {/* Mastro com bandeira sutil ao fundo */}
      <mesh position={[-10, 5, -15]}>
        <cylinderGeometry args={[0.08, 0.08, 10, 8]} />
        <meshStandardMaterial color={COLORS.platinum} metalness={0.5} />
      </mesh>
      <mesh position={[-8.6, 8.5, -15]}>
        <planeGeometry args={[2.6, 1.6]} />
        <meshStandardMaterial color={COLORS.navalBlue} side={2} />
      </mesh>

      {/* Jipes ao fundo (low-poly) */}
      {[-7, 7].map((x, i) => (
        <group key={i} position={[x, 0.7, -10]}>
          <mesh castShadow>
            <boxGeometry args={[3, 1.4, 1.6]} />
            <meshStandardMaterial color="#3F5641" roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.1, 0]}>
            <boxGeometry args={[2, 0.9, 1.5]} />
            <meshStandardMaterial color="#34472f" roughness={0.7} />
          </mesh>
          {[-1.1, 1.1].map((wz) =>
            [-0.7, 0.7].map((wx) => (
              <mesh key={`${wx}-${wz}`} position={[wx, -0.5, wz]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.35, 0.35, 0.3, 12]} />
                <meshStandardMaterial color="#0a0a14" />
              </mesh>
            )),
          )}
        </group>
      ))}

      {/* Torres laterais */}
      {[-12, 12].map((x, i) => (
        <mesh key={i} position={[x, 5, -16]} castShadow receiveShadow>
          <boxGeometry args={[2, 10, 2]} />
          <meshStandardMaterial color="#2a3344" roughness={0.8} />
        </mesh>
      ))}

      {/* Iluminação local */}
      <ambientLight intensity={0.45} color={COLORS.abyssBlue} />
      <directionalLight
        position={[8, 16, 8]}
        intensity={1.1}
        color={COLORS.iceBlue}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <directionalLight position={[-12, 8, 6]} intensity={0.4} color={COLORS.skyBlue} />
    </group>
  )
}
