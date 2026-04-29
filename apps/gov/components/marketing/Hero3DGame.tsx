'use client'

/**
 * Hero3DGame — jogo 3D jogável que precede o landing de gov.licitagram.com
 *
 * Conceito: o usuário controla um servidor público que percorre 4 órgãos
 * (Quartel do Exército → Hangar da Aeronáutica → Prefeitura → Palácio do
 * Governo) e finaliza junto à bandeira do Brasil. Cada check-point destrava
 * um banner com uma feature do produto. Quando a missão é concluída, o
 * componente dispara `onComplete` e o site é revelado.
 *
 * Controles: mover o mouse para guiar o personagem (cursor = direção alvo).
 * Não usa pointer-lock: é HUD-friendly e funciona em qualquer trackpad.
 *
 * Stack: three.js puro (sem react-three-fiber) — totalmente client-side.
 */

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

type Props = {
  onComplete: () => void
}

const CHECKPOINTS = [
  {
    z: -40,
    color: '#3F5641', // verde militar
    accent: '#A4B58B',
    label: 'Quartel do Exército',
    feature: 'PCA Collector — coleta demandas dos setores em link mobile',
  },
  {
    z: -90,
    color: '#1F4E79', // azul aeronáutica
    accent: '#7FB3D5',
    label: 'Hangar da Aeronáutica',
    feature: 'DFD + ETP redigidos com citações Lei 14.133 art. 12 e 18',
  },
  {
    z: -140,
    color: '#C8B687', // bege prefeitura
    accent: '#F0DEA8',
    label: 'Prefeitura Municipal',
    feature: 'Cesta de Preços PNCP automática · Acórdão TCU 1.875/2021',
  },
  {
    z: -190,
    color: '#2E2A4D', // roxo palácio
    accent: '#C9B86E',
    label: 'Palácio do Planalto',
    feature: 'TR + Edital + Parecer com compliance determinístico',
  },
]

const FINALE_Z = -240
const PATH_HALF_WIDTH = 6
const CHECKPOINT_RADIUS = 5
const CHARACTER_SPEED = 0.22

export function Hero3DGame({ onComplete }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [visited, setVisited] = useState<Set<number>>(new Set())
  const [activeBanner, setActiveBanner] = useState<{ label: string; feature: string } | null>(null)
  const [progress, setProgress] = useState(0)
  const [missionDone, setMissionDone] = useState(false)
  const [started, setStarted] = useState(false)

  // Mouse target em coordenadas normalizadas [-1, 1]
  const mouseRef = useRef({ x: 0, y: 0 })
  const visitedRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    visitedRef.current = visited
  }, [visited])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0B1120')
    scene.fog = new THREE.Fog('#0B1120', 60, 220)

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      400,
    )
    camera.position.set(0, 12, 14)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    // ── Lighting ───────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0x6677aa, 0.55)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xfff1c2, 1.1)
    sun.position.set(20, 40, 20)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -50
    sun.shadow.camera.right = 50
    sun.shadow.camera.top = 50
    sun.shadow.camera.bottom = -50
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 100
    scene.add(sun)

    const rim = new THREE.DirectionalLight(0xff7a3a, 0.4)
    rim.position.set(-15, 10, 30)
    scene.add(rim)

    // ── Ground ─────────────────────────────────────────────────
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 320),
      new THREE.MeshStandardMaterial({ color: '#1a2236', roughness: 0.95 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.z = -120
    ground.receiveShadow = true
    scene.add(ground)

    // Caminho (trilha mais clara)
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 320),
      new THREE.MeshStandardMaterial({ color: '#2d3a55', roughness: 0.85 }),
    )
    path.rotation.x = -Math.PI / 2
    path.position.set(0, 0.01, -120)
    path.receiveShadow = true
    scene.add(path)

    // Stripes na trilha
    for (let i = 0; i < 30; i++) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 2),
        new THREE.MeshBasicMaterial({ color: '#5b6a8e' }),
      )
      stripe.rotation.x = -Math.PI / 2
      stripe.position.set(0, 0.02, -i * 9 - 5)
      scene.add(stripe)
    }

    // ── Checkpoints (prédios) ──────────────────────────────────
    const checkpointBeacons: THREE.Mesh[] = []
    CHECKPOINTS.forEach((cp, idx) => {
      const group = new THREE.Group()

      // Prédio principal
      const buildingHeight = 6 + idx * 1.5
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(8, buildingHeight, 8),
        new THREE.MeshStandardMaterial({ color: cp.color, roughness: 0.7 }),
      )
      building.position.set(-12, buildingHeight / 2, cp.z)
      building.castShadow = true
      building.receiveShadow = true
      group.add(building)

      // Janelas (grid de pequenos boxes brilhantes)
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const window = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.8, 0.1),
            new THREE.MeshStandardMaterial({
              color: cp.accent,
              emissive: cp.accent,
              emissiveIntensity: 0.4,
            }),
          )
          window.position.set(
            -12 + 4.05,
            1.5 + row * 1.5,
            cp.z - 2.5 + col * 2.5,
          )
          group.add(window)
        }
      }

      // Telhado / topper
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(6, 3, 4),
        new THREE.MeshStandardMaterial({ color: cp.accent, roughness: 0.5 }),
      )
      roof.position.set(-12, buildingHeight + 1.5, cp.z)
      roof.rotation.y = Math.PI / 4
      roof.castShadow = true
      group.add(roof)

      // Beacon (cilindro pulsante no caminho marcando o checkpoint)
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 8, 16),
        new THREE.MeshStandardMaterial({
          color: cp.accent,
          emissive: cp.accent,
          emissiveIntensity: 0.8,
          transparent: true,
          opacity: 0.7,
        }),
      )
      beacon.position.set(0, 4, cp.z)
      beacon.userData.checkpointIdx = idx
      group.add(beacon)
      checkpointBeacons.push(beacon)

      // Placa lateral
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(3, 1.2, 0.2),
        new THREE.MeshStandardMaterial({ color: '#0f172a' }),
      )
      plate.position.set(-6, 1.5, cp.z + 4)
      group.add(plate)

      // Árvores decorativas do outro lado
      const tree = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 4, 8),
        new THREE.MeshStandardMaterial({ color: '#1f3a26' }),
      )
      tree.position.set(10, 2, cp.z)
      tree.castShadow = true
      group.add(tree)
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 1.2, 6),
        new THREE.MeshStandardMaterial({ color: '#3b2a1a' }),
      )
      trunk.position.set(10, 0.6, cp.z)
      group.add(trunk)

      scene.add(group)
    })

    // ── Final: bandeira + pedestal ─────────────────────────────
    const flagBase = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 5, 1.5, 16),
      new THREE.MeshStandardMaterial({ color: '#3a4456', roughness: 0.6 }),
    )
    flagBase.position.set(0, 0.75, FINALE_Z + 5)
    flagBase.castShadow = true
    flagBase.receiveShadow = true
    scene.add(flagBase)

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 14, 8),
      new THREE.MeshStandardMaterial({ color: '#d4d4d8', metalness: 0.6 }),
    )
    pole.position.set(0, 8, FINALE_Z + 5)
    scene.add(pole)

    // Pano da bandeira (verde)
    const flagGreen = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 3.4),
      new THREE.MeshStandardMaterial({ color: '#009C3B', side: THREE.DoubleSide }),
    )
    flagGreen.position.set(2.6, 12, FINALE_Z + 5)
    scene.add(flagGreen)

    // Losango amarelo
    const yellow = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 1.8),
      new THREE.MeshStandardMaterial({ color: '#FFDF00', side: THREE.DoubleSide }),
    )
    yellow.position.set(2.6, 12, FINALE_Z + 5.01)
    yellow.rotation.z = Math.PI / 4
    yellow.scale.set(0.85, 1.4, 1)
    scene.add(yellow)

    // Disco azul
    const blueCircle = new THREE.Mesh(
      new THREE.CircleGeometry(0.8, 32),
      new THREE.MeshStandardMaterial({ color: '#002776', side: THREE.DoubleSide }),
    )
    blueCircle.position.set(2.6, 12, FINALE_Z + 5.02)
    scene.add(blueCircle)

    // Mapa do Brasil (extrusão simplificada via planos)
    for (let i = 0; i < 12; i++) {
      const blob = new THREE.Mesh(
        new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 8, 8),
        new THREE.MeshStandardMaterial({
          color: '#FFDF00',
          emissive: '#FFDF00',
          emissiveIntensity: 0.3,
        }),
      )
      blob.position.set(
        (Math.random() - 0.5) * 6,
        0.3,
        FINALE_Z - 3 - Math.random() * 6,
      )
      scene.add(blob)
    }

    // ── Personagem ─────────────────────────────────────────────
    const character = new THREE.Group()

    // Corpo
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.5, 1.4, 4, 8),
      new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.6 }),
    )
    body.position.y = 1.2
    body.castShadow = true
    character.add(body)

    // Cabeça
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 16, 16),
      new THREE.MeshStandardMaterial({ color: '#f4d4a3', roughness: 0.7 }),
    )
    head.position.y = 2.4
    head.castShadow = true
    character.add(head)

    // Boné/quepe
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.42, 0.2, 12),
      new THREE.MeshStandardMaterial({ color: '#0f172a' }),
    )
    cap.position.y = 2.7
    character.add(cap)

    // Pernas (animadas)
    const legL = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1, 0.3),
      new THREE.MeshStandardMaterial({ color: '#0f172a' }),
    )
    legL.position.set(-0.2, 0.4, 0)
    legL.castShadow = true
    character.add(legL)

    const legR = legL.clone()
    legR.position.x = 0.2
    character.add(legR)

    character.position.set(0, 0, 0)
    scene.add(character)

    // Halo no chão sob o personagem (indica posição)
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.1, 32),
      new THREE.MeshBasicMaterial({
        color: '#fbbf24',
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      }),
    )
    halo.rotation.x = -Math.PI / 2
    halo.position.y = 0.05
    scene.add(halo)

    // ── Estrelas no fundo ──────────────────────────────────────
    const starCount = 200
    const starsGeo = new THREE.BufferGeometry()
    const starsPos = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      starsPos[i * 3] = (Math.random() - 0.5) * 200
      starsPos[i * 3 + 1] = Math.random() * 80 + 30
      starsPos[i * 3 + 2] = (Math.random() - 0.5) * 200 - 100
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3))
    const stars = new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.25 }),
    )
    scene.add(stars)

    // ── Mouse handler ──────────────────────────────────────────
    const handleMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = ((e.clientY - rect.top) / rect.height) * 2 - 1
    }
    renderer.domElement.addEventListener('mousemove', handleMouseMove)

    const handleResize = () => {
      if (!mountRef.current) return
      const w = mountRef.current.clientWidth
      const h = mountRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    // ── Animation loop ─────────────────────────────────────────
    let frameId = 0
    let walkPhase = 0
    let lastFrame = performance.now()
    let missionFlag = false

    const tmpVec = new THREE.Vector3()

    const animate = () => {
      const now = performance.now()
      const dt = Math.min((now - lastFrame) / 16.6, 3)
      lastFrame = now

      // Steering: mouse X em [-1,1] → deslocamento lateral. Y vira velocidade.
      const targetX = mouseRef.current.x * PATH_HALF_WIDTH * 1.6
      // Velocidade modulada pela posição vertical do mouse: pra cima = mais rápido
      const speedFactor = Math.max(0.45, 1 - mouseRef.current.y * 0.5)
      const speed = CHARACTER_SPEED * speedFactor * dt

      // Move character toward targetX e sempre forward (z negativo)
      const dx = targetX - character.position.x
      character.position.x += Math.sign(dx) * Math.min(Math.abs(dx), 0.18 * dt)
      character.position.x = Math.max(-PATH_HALF_WIDTH, Math.min(PATH_HALF_WIDTH, character.position.x))
      character.position.z -= speed

      // Heading: corpo gira ligeiramente pra direção do movimento
      const headingTarget = Math.atan2(dx, -1) * 0.4
      character.rotation.y += (headingTarget - character.rotation.y) * 0.1

      // Walk cycle (pernas)
      walkPhase += speed * 4
      legL.rotation.x = Math.sin(walkPhase) * 0.6
      legR.rotation.x = -Math.sin(walkPhase) * 0.6
      body.position.y = 1.2 + Math.abs(Math.sin(walkPhase * 2)) * 0.05

      // Halo segue
      halo.position.x = character.position.x
      halo.position.z = character.position.z
      halo.scale.setScalar(1 + Math.sin(now * 0.004) * 0.1)

      // Camera segue suavemente atrás e acima
      camera.position.x += (character.position.x * 0.3 - camera.position.x) * 0.05
      camera.position.z += (character.position.z + 14 - camera.position.z) * 0.05
      camera.position.y += (12 - camera.position.y) * 0.05
      camera.lookAt(character.position.x, 1.5, character.position.z - 6)

      // Beacons pulsam
      checkpointBeacons.forEach((b, idx) => {
        const isVisited = visitedRef.current.has(idx)
        const mat = b.material as THREE.MeshStandardMaterial
        mat.emissiveIntensity = isVisited ? 0.2 : 0.6 + Math.sin(now * 0.005 + idx) * 0.4
        mat.opacity = isVisited ? 0.3 : 0.7
        b.scale.y = isVisited ? 0.4 : 1
      })

      // Detecta checkpoints
      CHECKPOINTS.forEach((cp, idx) => {
        if (visitedRef.current.has(idx)) return
        tmpVec.set(0, character.position.y, cp.z)
        const dist = Math.hypot(character.position.x - 0, character.position.z - cp.z)
        if (dist < CHECKPOINT_RADIUS) {
          const next = new Set(visitedRef.current)
          next.add(idx)
          visitedRef.current = next
          setVisited(next)
          setActiveBanner({ label: cp.label, feature: cp.feature })
          setTimeout(() => setActiveBanner(null), 3500)
        }
      })

      // Progress: distância percorrida em direção ao finale
      const totalDist = Math.abs(FINALE_Z)
      const traveled = Math.max(0, Math.min(1, -character.position.z / totalDist))
      setProgress(traveled)

      // Mission complete quando chega na bandeira
      if (!missionFlag && character.position.z <= FINALE_Z + 8) {
        missionFlag = true
        setMissionDone(true)
      }

      // Stars girando suavemente
      stars.rotation.y += 0.0001 * dt

      // Bandeira balança
      flagGreen.rotation.y = Math.sin(now * 0.002) * 0.15
      yellow.rotation.y = flagGreen.rotation.y
      blueCircle.rotation.y = flagGreen.rotation.y

      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('mousemove', handleMouseMove)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose())
          } else {
            obj.material.dispose()
          }
        }
      })
    }
  }, [])

  // Quando mission done, fade-out e dispara onComplete
  useEffect(() => {
    if (!missionDone) return
    const t = setTimeout(() => onComplete(), 2200)
    return () => clearTimeout(t)
  }, [missionDone, onComplete])

  return (
    <div className="fixed inset-0 z-[100] bg-[#0B1120]">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {/* Overlay de início */}
      {!started && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0B1120]/80 backdrop-blur-sm">
          <div className="max-w-lg px-6 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-amber-400">
              Missão · Fase Interna
            </p>
            <h1 className="mt-4 text-3xl font-light text-white sm:text-5xl">
              Conduza um servidor público<br />
              <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 bg-clip-text text-transparent">
                do DFD ao Edital
              </span>
            </h1>
            <p className="mt-5 text-sm text-white/70 sm:text-base">
              Mova o mouse para guiar o servidor pelos 4 órgãos. Cada checkpoint
              destrava uma capacidade do <span className="text-amber-300">LicitaGram Gov</span>.
              Chegue à bandeira para concluir a missão e revelar o site.
            </p>
            <button
              onClick={() => setStarted(true)}
              className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-8 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-orange-500/20 transition hover:brightness-110"
            >
              Iniciar missão →
            </button>
            <button
              onClick={() => onComplete()}
              className="mt-3 block w-full text-xs text-white/40 hover:text-white/70"
            >
              pular e ir direto ao site
            </button>
          </div>
        </div>
      )}

      {/* HUD: progresso + checkpoints */}
      {started && !missionDone && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-6">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between text-xs font-mono text-white/70">
              <span className="uppercase tracking-[0.2em] text-amber-400">Missão · Fase Interna</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 transition-[width] duration-300"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-[10px] font-mono uppercase tracking-wider">
              {CHECKPOINTS.map((cp, idx) => (
                <div
                  key={idx}
                  className={`rounded border px-2 py-1.5 text-center transition ${
                    visited.has(idx)
                      ? 'border-amber-400/60 bg-amber-400/10 text-amber-200'
                      : 'border-white/10 text-white/40'
                  }`}
                >
                  {visited.has(idx) ? '✓ ' : '○ '}
                  {cp.label.split(' ').slice(-1)[0]}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Banner de checkpoint */}
      {activeBanner && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-4">
          <div className="max-w-md animate-[banner-pop_0.4s_ease-out] rounded-xl border border-amber-400/40 bg-slate-900/90 px-6 py-4 shadow-2xl backdrop-blur">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-400">
              Checkpoint
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{activeBanner.label}</p>
            <p className="mt-1.5 text-xs text-white/70">{activeBanner.feature}</p>
          </div>
        </div>
      )}

      {/* Dica de controle */}
      {started && !missionDone && progress < 0.05 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center">
          <div className="rounded-full border border-white/10 bg-slate-900/70 px-5 py-2 text-xs text-white/70 backdrop-blur">
            ← mova o mouse para guiar →
          </div>
        </div>
      )}

      {/* Mission complete overlay */}
      {missionDone && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0B1120]/85 backdrop-blur animate-[fade-in_0.5s_ease-out]">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
            ✓ missão concluída
          </p>
          <h2 className="mt-4 text-3xl font-light text-white sm:text-5xl">
            <span className="bg-gradient-to-r from-emerald-300 via-amber-300 to-orange-400 bg-clip-text text-transparent">
              Bem-vindo ao LicitaGram Gov
            </span>
          </h2>
          <p className="mt-3 text-sm text-white/60">revelando o site...</p>
        </div>
      )}

      <style jsx>{`
        @keyframes banner-pop {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
