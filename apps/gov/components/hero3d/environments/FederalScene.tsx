'use client'

/**
 * Governo Federal — salão institucional dramático.
 */

import { COLORS } from '../constants'

export function FederalScene() {
  return (
    <group>
      {/* Piso escuro polido */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0c1430" roughness={0.2} metalness={0.5} />
      </mesh>

      {/* Tapete vermelho central */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, -8]}>
        <planeGeometry args={[3, 30]} />
        <meshStandardMaterial color="#5a1018" roughness={0.7} />
      </mesh>

      {/* Rampa estilizada (silhueta tipo Planalto) */}
      <mesh position={[0, 0.5, -16]} castShadow receiveShadow>
        <boxGeometry args={[14, 1, 6]} />
        <meshStandardMaterial color="#dfe3e8" roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.2, -19]} castShadow>
        <boxGeometry args={[12, 0.3, 1]} />
        <meshStandardMaterial color="#f1f2f4" roughness={0.3} />
      </mesh>

      {/* Colunas finas modernistas */}
      {[-4, -1.3, 1.3, 4].map((x) => (
        <mesh key={x} position={[x, 4, -22]} castShadow>
          <cylinderGeometry args={[0.18, 0.18, 8, 12]} />
          <meshStandardMaterial color="#f1f2f4" roughness={0.4} />
        </mesh>
      ))}

      {/* Brasão genérico (estrela octagonal dourada) */}
      <mesh position={[0, 5.5, -24]} rotation={[0, 0, Math.PI / 8]}>
        <ringGeometry args={[1.3, 1.6, 8]} />
        <meshStandardMaterial color={COLORS.gold} metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, 5.5, -24.05]}>
        <circleGeometry args={[1.3, 8]} />
        <meshStandardMaterial color="#0a1430" />
      </mesh>

      {/* Mastros com bandeiras BR ao fundo (silhueta) */}
      {[-5, 5].map((x, i) => (
        <group key={i} position={[x, 0, -23]}>
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 8, 8]} />
            <meshStandardMaterial color={COLORS.platinum} metalness={0.7} />
          </mesh>
          <mesh position={[0.9, 6.6, 0]}>
            <planeGeometry args={[1.6, 1.05]} />
            <meshStandardMaterial color={COLORS.brazilGreen} side={2} />
          </mesh>
        </group>
      ))}

      {/* Iluminação dramática */}
      <ambientLight intensity={0.3} color={COLORS.abyssBlue} />
      <directionalLight
        position={[6, 14, 8]}
        intensity={1.0}
        color={COLORS.gold}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-8, 6, 4]} intensity={0.5} color={COLORS.iceBlue} />
      <pointLight position={[0, 5, -22]} intensity={1.5} color={COLORS.gold} distance={14} />
    </group>
  )
}
