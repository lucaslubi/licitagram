'use client'

/**
 * Prefeitura — hall com colunas, mármore e balcão de atendimento.
 */

import { COLORS } from '../constants'

export function CityHallScene() {
  return (
    <group>
      {/* Piso de mármore (xadrez sutil) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#dde3eb" roughness={0.25} metalness={0.1} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) =>
        Array.from({ length: 12 }).map((_, j) => (
          <mesh
            key={`${i}-${j}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[(i - 3.5) * 3, 0.011, -(j * 3 + 2)]}
          >
            <planeGeometry args={[2.9, 2.9]} />
            <meshStandardMaterial
              color={(i + j) % 2 === 0 ? '#cfd6e2' : '#e8edf3'}
              roughness={0.3}
              metalness={0.1}
            />
          </mesh>
        )),
      )}

      {/* Colunas brancas */}
      {[-6, 6].map((x) =>
        [-4, -10, -16].map((z) => (
          <group key={`${x}-${z}`} position={[x, 0, z]}>
            <mesh position={[0, 4, 0]} castShadow>
              <cylinderGeometry args={[0.4, 0.5, 8, 16]} />
              <meshStandardMaterial color="#f1f2f4" roughness={0.4} />
            </mesh>
            <mesh position={[0, 8.2, 0]}>
              <boxGeometry args={[1.2, 0.4, 1.2]} />
              <meshStandardMaterial color="#dfe3e8" roughness={0.4} />
            </mesh>
          </group>
        )),
      )}

      {/* Teto */}
      <mesh position={[0, 9, -10]}>
        <boxGeometry args={[16, 0.3, 24]} />
        <meshStandardMaterial color="#2c3e60" roughness={0.7} />
      </mesh>

      {/* Balcão atendimento */}
      <mesh position={[0, 0.6, -18]} castShadow receiveShadow>
        <boxGeometry args={[8, 1.2, 1.2]} />
        <meshStandardMaterial color={COLORS.royalBlue} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.3, -18]}>
        <boxGeometry args={[7.8, 0.1, 1.4]} />
        <meshStandardMaterial color="#dfe3e8" roughness={0.3} />
      </mesh>

      {/* Painel digital "ATENDIMENTO" */}
      <mesh position={[0, 4, -19.5]}>
        <boxGeometry args={[6, 1.6, 0.1]} />
        <meshStandardMaterial color="#0a1430" />
      </mesh>
      <mesh position={[0, 4, -19.45]}>
        <planeGeometry args={[5.6, 1.2]} />
        <meshStandardMaterial
          color={COLORS.skyBlue}
          emissive={COLORS.skyBlue}
          emissiveIntensity={0.6}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Iluminação interna */}
      <ambientLight intensity={0.6} color={COLORS.iceBlue} />
      <pointLight position={[0, 8, -4]} intensity={1.2} color={COLORS.iceBlue} distance={20} />
      <pointLight position={[0, 8, -14]} intensity={1.0} color={COLORS.royalBlue} distance={18} />
      <directionalLight
        position={[8, 14, 8]}
        intensity={0.8}
        color={COLORS.iceBlue}
        castShadow
      />
    </group>
  )
}
