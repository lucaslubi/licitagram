'use client'

/**
 * Aeronáutica — hangar aberto com caça estilizado e pista.
 */

import { COLORS } from '../constants'

export function AirForceScene() {
  return (
    <group>
      {/* Chão (pista) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#101b30" roughness={0.9} />
      </mesh>

      {/* Faixas da pista */}
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -i * 6 - 4]}>
          <planeGeometry args={[1.2, 3]} />
          <meshBasicMaterial color={COLORS.platinum} />
        </mesh>
      ))}

      {/* Hangar */}
      <group position={[0, 0, -16]}>
        {/* Estrutura arqueada */}
        <mesh position={[0, 5, 0]} castShadow receiveShadow>
          <boxGeometry args={[24, 0.4, 16]} />
          <meshStandardMaterial color="#1a2740" roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Colunas */}
        {[-11, 11].map((x, i) => (
          <mesh key={i} position={[x, 2.5, 0]} castShadow>
            <boxGeometry args={[0.5, 5, 0.5]} />
            <meshStandardMaterial color="#2a3a55" roughness={0.5} metalness={0.4} />
          </mesh>
        ))}
        {/* Faixa azul superior */}
        <mesh position={[0, 5.5, 4.1]}>
          <boxGeometry args={[24, 0.5, 0.1]} />
          <meshStandardMaterial color={COLORS.skyBlue} emissive={COLORS.skyBlue} emissiveIntensity={0.3} />
        </mesh>
      </group>

      {/* Caça estilizado (Gripen-like, low-poly) */}
      <group position={[0, 1.4, -16]} rotation={[0, Math.PI, 0]}>
        {/* Fuselagem */}
        <mesh castShadow>
          <coneGeometry args={[0.6, 6, 8]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <coneGeometry args={[0.6, 6, 8]} />
          <meshStandardMaterial color={COLORS.platinum} metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0]} castShadow>
          <cylinderGeometry args={[0.6, 0.4, 4, 12]} />
          <meshStandardMaterial color="#cfd6e2" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Asas */}
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[7, 0.15, 1.6]} />
          <meshStandardMaterial color="#a8b1bf" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Cauda */}
        <mesh position={[0, 0.8, 1.8]} castShadow>
          <boxGeometry args={[0.15, 1.2, 1]} />
          <meshStandardMaterial color="#a8b1bf" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Cockpit */}
        <mesh position={[0, 0.4, -0.8]}>
          <sphereGeometry args={[0.5, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial color="#0a1830" roughness={0.05} metalness={0.1} clearcoat={1} />
        </mesh>
      </group>

      {/* Nuvens volumétricas leves (esferas com fog) */}
      {[
        [-10, 8, -22],
        [12, 9, -25],
        [-4, 11, -30],
        [6, 7, -18],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <sphereGeometry args={[3, 12, 12]} />
          <meshStandardMaterial color="#5a7aa8" transparent opacity={0.25} />
        </mesh>
      ))}

      {/* Iluminação */}
      <ambientLight intensity={0.55} color={COLORS.skyBlue} />
      <directionalLight
        position={[12, 18, 6]}
        intensity={1.4}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-10, 10, -8]} intensity={0.5} color={COLORS.skyBlue} />
    </group>
  )
}
