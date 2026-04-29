'use client'

/**
 * Finale — bandeira do Brasil tremulando + mapa BR estilizado + texto 3D.
 *
 * Bandeira: shader de vento no vertex (sin/cos do uv).
 * Mapa BR: nuvem de pontos amarelos formando contorno aproximado.
 * Texto: drei <Text> com material metálico.
 */

import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { COLORS } from '../constants'

// Shader simplificado: pano da bandeira balançando
const flagVertex = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float wave = sin(p.x * 2.5 + uTime * 2.0) * 0.12 * (uv.x);
    p.z += wave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`
const flagFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    // Verde
    vec3 green = vec3(0.0, 0.612, 0.231);
    // Amarelo losango (aproximação por distância ao centro em UV)
    vec2 c = vUv - vec2(0.5);
    float losango = abs(c.x) * 1.6 + abs(c.y) * 2.6;
    float yellowMask = 1.0 - smoothstep(0.32, 0.34, losango);
    // Azul disco
    float blue = 1.0 - smoothstep(0.10, 0.105, length(c));
    vec3 col = green;
    col = mix(col, vec3(1.0, 0.875, 0.0), yellowMask);
    col = mix(col, vec3(0.0, 0.156, 0.463), blue);
    // Sombra de dobra
    float shade = 0.85 + 0.15 * sin(vUv.x * 10.0 + uTime * 2.0);
    col *= shade;
    gl_FragColor = vec4(col, 1.0);
  }
`

// Coordenadas aproximadas do contorno do Brasil normalizadas (paramétrico simples)
function makeBrazilOutlinePoints(): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  // Forma simplificada: silhueta arredondada com saliência norte
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * Math.PI * 2
    const r = 3.5 + Math.sin(a * 3) * 0.6 + Math.cos(a * 5) * 0.3
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r * 1.15
    pts.push(new THREE.Vector3(x, 0.05, z))
  }
  return pts
}

export function BrazilFinaleScene() {
  const flagMatRef = useRef<THREE.ShaderMaterial>(null)
  const textRef = useRef<THREE.Group>(null)

  const flagUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    [],
  )

  const brazilPoints = useMemo(() => makeBrazilOutlinePoints(), [])

  useFrame(({ clock }) => {
    if (flagMatRef.current) {
      const u = flagMatRef.current.uniforms.uTime
      if (u) u.value = clock.getElapsedTime()
    }
    if (textRef.current) {
      textRef.current.position.y = 4 + Math.sin(clock.getElapsedTime() * 0.6) * 0.08
    }
  })

  return (
    <group>
      {/* Chão escuro com gradiente */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#06102a" roughness={0.6} metalness={0.2} />
      </mesh>

      {/* Mapa BR — pontos amarelos formando contorno */}
      <group position={[0, 0, -4]}>
        {brazilPoints.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.18, 8, 8]} />
            <meshStandardMaterial
              color={COLORS.brazilYellow}
              emissive={COLORS.brazilYellow}
              emissiveIntensity={0.6}
            />
          </mesh>
        ))}
        {/* Preenchimento sutil (disco verde semi-transparente sob os pontos) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[3.6, 64]} />
          <meshBasicMaterial color={COLORS.brazilGreen} transparent opacity={0.18} />
        </mesh>
      </group>

      {/* Bandeira do Brasil — pano tremulando */}
      <group position={[-4, 6, -3]}>
        {/* Mastro */}
        <mesh position={[-2.6, -2, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 12, 12]} />
          <meshStandardMaterial color={COLORS.platinum} metalness={0.7} />
        </mesh>
        {/* Pano */}
        <mesh position={[0, 1, 0]}>
          <planeGeometry args={[5, 3.4, 32, 22]} />
          <shaderMaterial
            ref={flagMatRef}
            uniforms={flagUniforms}
            vertexShader={flagVertex}
            fragmentShader={flagFragment}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Texto 3D LICITAGRAM GOV */}
      <group ref={textRef} position={[0, 4, 2]}>
        <Text
          fontSize={1.05}
          letterSpacing={-0.02}
          anchorX="center"
          anchorY="middle"
          maxWidth={20}
        >
          LICITAGRAM GOV
          <meshStandardMaterial
            color={COLORS.iceBlue}
            emissive={COLORS.skyBlue}
            emissiveIntensity={0.2}
            metalness={0.85}
            roughness={0.18}
          />
        </Text>
      </group>

      {/* Iluminação cálida-fria */}
      <ambientLight intensity={0.5} color={COLORS.iceBlue} />
      <directionalLight position={[6, 14, 6]} intensity={1.2} color="#ffffff" castShadow />
      <directionalLight position={[-8, 8, -4]} intensity={0.6} color={COLORS.skyBlue} />
      <pointLight position={[0, 4, 4]} intensity={1.0} color={COLORS.brazilYellow} distance={14} />
    </group>
  )
}
