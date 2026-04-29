'use client'

/**
 * Hero animation: 2D side-scrolling game for the landing page.
 *
 * O personagem caminha por 4 cenários do mercado público brasileiro:
 * Exército → Aeronáutica → Prefeitura → Palácio do Governo. Em cada cenário
 * troca de uniforme. Banners com features do app aparecem entre as cenas.
 * Final: bandeira + mapa do Brasil estilizado.
 *
 * Tudo SVG inline + CSS keyframes — sem assets externos, sem libs de animação.
 * Loop infinito de ~32s.
 */

import { useEffect, useState } from 'react'

// Each scene = 7s. Total cycle = 4 scenes × 7s + finale 4s = 32s
const TOTAL_DURATION = 32

const SCENES = [
  {
    id: 'exercito',
    label: 'Exército',
    bgFrom: '#1f3d1f',
    bgTo: '#3d5d2f',
    accent: '#5a7a3a',
    feature: 'Monitoramento federal 24/7',
    sub: '+250.000 licitações por mês',
    icon: '★',
    building: 'quartel',
    outfit: 'army',
  },
  {
    id: 'aeronautica',
    label: 'Aeronáutica',
    bgFrom: '#1a2d4a',
    bgTo: '#2c5282',
    accent: '#4a90d9',
    feature: 'IA Match Score 0-100',
    sub: 'Precisão semântica por CNAE',
    icon: '✈',
    building: 'hangar',
    outfit: 'air',
  },
  {
    id: 'prefeitura',
    label: 'Prefeitura',
    bgFrom: '#6b5d3a',
    bgTo: '#8a7a4d',
    accent: '#c9b176',
    feature: 'Compliance automático',
    sub: '13 tipos de certidões verificadas',
    icon: '⚖',
    building: 'prefeitura',
    outfit: 'civil',
  },
  {
    id: 'palacio',
    label: 'Palácio do Governo',
    bgFrom: '#2a2a3d',
    bgTo: '#4a4a6a',
    accent: '#d4af37',
    feature: 'Robô de lances autônomo',
    sub: 'Disputa em tempo real com IA',
    icon: '◆',
    building: 'palacio',
    outfit: 'suit',
  },
] as const

export function HeroGameAnimation() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  if (reduced) {
    // Static fallback respeita prefers-reduced-motion: tela única estilizada
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-[#1A1C1F] via-[#0f1c2e] to-[#1A1C1F]">
        <BrazilFinale static />
      </div>
    )
  }

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Skies/walls dos cenários — cada um aparece na sua janela do timeline */}
      {SCENES.map((scene, i) => (
        <SceneLayer key={scene.id} scene={scene} index={i} />
      ))}

      {/* Final: Brasil */}
      <div className="absolute inset-0 hero-final-frame">
        <BrazilFinale />
      </div>

      {/* Personagem caminhando — sempre fixo no centro-baixo */}
      <Character />

      {/* Chão + parallax foreground */}
      <Ground />

      <style jsx>{`
        /* Master cycle */
        :global(.hero-scene-frame) {
          animation: scene-show ${TOTAL_DURATION}s linear infinite;
          opacity: 0;
        }
        :global(.hero-scene-frame[data-i='0']) { animation-delay: 0s; }
        :global(.hero-scene-frame[data-i='1']) { animation-delay: 7s; }
        :global(.hero-scene-frame[data-i='2']) { animation-delay: 14s; }
        :global(.hero-scene-frame[data-i='3']) { animation-delay: 21s; }
        :global(.hero-final-frame) {
          animation: finale-show ${TOTAL_DURATION}s linear infinite;
          opacity: 0;
          animation-delay: 28s;
        }

        @keyframes scene-show {
          0% { opacity: 0; transform: translateX(8%); }
          /* janela de 7s = ~21.875% do ciclo */
          1% { opacity: 0; transform: translateX(8%); }
          5% { opacity: 1; transform: translateX(0); }
          18% { opacity: 1; transform: translateX(0); }
          22% { opacity: 0; transform: translateX(-8%); }
          100% { opacity: 0; }
        }

        @keyframes finale-show {
          0% { opacity: 0; transform: scale(0.95); }
          85% { opacity: 0; transform: scale(0.95); }
          88% { opacity: 1; transform: scale(1); }
          98% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.02); }
        }
      `}</style>
    </div>
  )
}

// ─── Cenário individual ─────────────────────────────────────────────────────

function SceneLayer({
  scene,
  index,
}: {
  scene: (typeof SCENES)[number]
  index: number
}) {
  return (
    <div className="absolute inset-0 hero-scene-frame" data-i={index}>
      {/* Sky gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${scene.bgFrom} 0%, ${scene.bgTo} 75%, #0a0a0a 100%)`,
        }}
      />
      {/* Sun/light */}
      <div
        className="absolute top-[12%] right-[18%] w-32 h-32 rounded-full blur-3xl"
        style={{ background: scene.accent, opacity: 0.35 }}
      />
      {/* Distant skyline (always rendered, change per scene via icon) */}
      <Skyline scene={scene} />
      {/* Banner com feature do app */}
      <FeatureBanner scene={scene} />
    </div>
  )
}

// ─── Skyline / Building ─────────────────────────────────────────────────────

function Skyline({ scene }: { scene: (typeof SCENES)[number] }) {
  const buildingMap: Record<string, JSX.Element> = {
    quartel: <Quartel accent={scene.accent} />,
    hangar: <Hangar accent={scene.accent} />,
    prefeitura: <Prefeitura accent={scene.accent} />,
    palacio: <Palacio accent={scene.accent} />,
  }
  return (
    <svg
      viewBox="0 0 1600 600"
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-x-0 bottom-[18%] w-full h-[70%]"
    >
      {buildingMap[scene.building]}
    </svg>
  )
}

function Quartel({ accent }: { accent: string }) {
  // Quartel do exército: fachada baixa, torre central, cores camufladas
  return (
    <g>
      {/* Distantes (background hills) */}
      <path d="M0 480 Q 200 420 400 460 T 800 450 T 1200 470 T 1600 460 L 1600 600 L 0 600 Z" fill="#0a1a0a" opacity="0.6" />
      {/* Building base */}
      <rect x="380" y="320" width="840" height="200" fill="#3a4d2a" stroke="#1a2a1a" strokeWidth="2" />
      <rect x="380" y="320" width="840" height="32" fill="#2a3a1a" />
      {/* Tower central */}
      <rect x="720" y="220" width="160" height="100" fill="#3a4d2a" stroke="#1a2a1a" strokeWidth="2" />
      <polygon points="720,220 800,170 880,220" fill="#5a7a3a" stroke="#1a2a1a" strokeWidth="2" />
      <rect x="780" y="170" width="40" height="60" fill="none" stroke="#1a2a1a" strokeWidth="2" />
      {/* Flag */}
      <line x1="800" y1="100" x2="800" y2="170" stroke="#fff" strokeWidth="3" />
      <rect x="800" y="100" width="50" height="32" fill="#3a7a3a" />
      <rect x="800" y="100" width="50" height="11" fill="#5a9a4a" />
      <rect x="800" y="121" width="50" height="11" fill="#1a4a1a" />
      {/* Star on building */}
      <text x="800" y="295" fontSize="42" fill={accent} textAnchor="middle">★</text>
      {/* Windows */}
      {[440, 540, 640, 960, 1060, 1160].map((x) => (
        <rect key={x} x={x} y={380} width={48} height={56} fill="#0a1a0a" />
      ))}
      {/* Door */}
      <rect x="776" y="440" width="48" height="80" fill="#0a1a0a" />
      <rect x="776" y="440" width="48" height="80" fill="none" stroke={accent} strokeWidth="1.5" />
      {/* Sign */}
      <rect x="700" y="335" width="200" height="20" fill="#1a2a1a" />
      <text x="800" y="350" fontSize="11" fill={accent} textAnchor="middle" fontFamily="monospace" letterSpacing="2">
        EXÉRCITO BRASILEIRO
      </text>
    </g>
  )
}

function Hangar({ accent }: { accent: string }) {
  // Hangar da Aeronáutica: arco curvo, avião pequeno
  return (
    <g>
      {/* Mountains/clouds bg */}
      <path d="M0 500 Q 300 440 600 470 T 1200 460 T 1600 470 L 1600 600 L 0 600 Z" fill="#0a1a3a" opacity="0.5" />
      {/* Cloud */}
      <ellipse cx="280" cy="200" rx="80" ry="22" fill="#fff" opacity="0.3" />
      <ellipse cx="1300" cy="160" rx="100" ry="28" fill="#fff" opacity="0.25" />
      {/* Hangar arch */}
      <path d="M 340 520 L 340 360 Q 800 200 1260 360 L 1260 520 Z" fill="#3a4d6a" stroke="#1a2a3a" strokeWidth="2.5" />
      <path d="M 340 360 Q 800 200 1260 360" fill="none" stroke="#1a2a3a" strokeWidth="3" />
      {/* Hangar interior darker */}
      <path d="M 380 510 L 380 380 Q 800 235 1220 380 L 1220 510 Z" fill="#1a2a3a" />
      {/* Doors lines */}
      {[500, 700, 900, 1100].map((x) => (
        <line key={x} x1={x} y1={400} x2={x} y2={510} stroke="#3a4d6a" strokeWidth="1" />
      ))}
      {/* Plane silhouette inside */}
      <g transform="translate(660 410)">
        <ellipse cx="80" cy="40" rx="100" ry="14" fill={accent} opacity="0.85" />
        <polygon points="40,40 -10,15 -20,40 -10,65" fill={accent} opacity="0.85" />
        <polygon points="60,30 50,5 70,5 80,30" fill={accent} opacity="0.85" />
        <polygon points="60,50 50,75 70,75 80,50" fill={accent} opacity="0.85" />
        <ellipse cx="155" cy="40" rx="20" ry="8" fill="#0a1a3a" />
      </g>
      {/* Tower / control */}
      <rect x="200" y="320" width="100" height="200" fill="#3a4d6a" stroke="#1a2a3a" strokeWidth="2" />
      <rect x="190" y="290" width="120" height="40" fill="#1a2a3a" />
      <rect x="200" y="298" width="100" height="24" fill={accent} opacity="0.4" />
      {/* FAB sign */}
      <rect x="700" y="220" width="200" height="40" fill="#1a2a3a" stroke={accent} strokeWidth="1.5" />
      <text x="800" y="247" fontSize="20" fill={accent} textAnchor="middle" fontFamily="monospace" fontWeight="bold" letterSpacing="3">
        FAB
      </text>
    </g>
  )
}

function Prefeitura({ accent }: { accent: string }) {
  // Câmara/prefeitura: prédio neoclássico com colunas, escadaria
  return (
    <g>
      {/* BG buildings */}
      <rect x="40" y="380" width="180" height="140" fill="#5a4a2a" opacity="0.6" />
      <rect x="1380" y="370" width="180" height="150" fill="#5a4a2a" opacity="0.6" />
      {/* Steps */}
      <rect x="500" y="490" width="600" height="12" fill="#a89870" />
      <rect x="520" y="478" width="560" height="12" fill="#b8a880" />
      <rect x="540" y="466" width="520" height="12" fill="#c8b890" />
      {/* Building base */}
      <rect x="540" y="320" width="520" height="146" fill="#d4c098" stroke="#3a2a1a" strokeWidth="2" />
      {/* Pediment */}
      <polygon points="540,320 800,240 1060,320" fill="#e4d0a8" stroke="#3a2a1a" strokeWidth="2" />
      <polygon points="600,316 800,260 1000,316" fill="none" stroke="#3a2a1a" strokeWidth="1.5" />
      {/* Columns */}
      {[600, 700, 800, 900, 1000].map((x) => (
        <g key={x}>
          <rect x={x - 14} y={325} width="28" height="135" fill="#e8d8b0" stroke="#3a2a1a" strokeWidth="1" />
          <rect x={x - 18} y={320} width="36" height="8" fill="#d4c098" stroke="#3a2a1a" strokeWidth="1" />
          <rect x={x - 18} y={460} width="36" height="8" fill="#d4c098" stroke="#3a2a1a" strokeWidth="1" />
        </g>
      ))}
      {/* Door big */}
      <rect x="780" y="380" width="40" height="80" fill="#3a2a1a" />
      <rect x="780" y="380" width="40" height="80" fill="none" stroke={accent} strokeWidth="1.5" />
      {/* Star/seal */}
      <circle cx="800" cy="285" r="22" fill={accent} opacity="0.8" />
      <text x="800" y="294" fontSize="22" fill="#3a2a1a" textAnchor="middle">⚖</text>
      {/* Sign */}
      <text x="800" y="490" fontSize="11" fill="#3a2a1a" textAnchor="middle" fontFamily="monospace" letterSpacing="2">
        PREFEITURA MUNICIPAL
      </text>
    </g>
  )
}

function Palacio({ accent }: { accent: string }) {
  // Palácio do Planalto: linhas modernas, arcos brancos
  return (
    <g>
      {/* Espelho d'água */}
      <rect x="0" y="490" width="1600" height="30" fill="#3a4a6a" opacity="0.5" />
      <rect x="0" y="490" width="1600" height="3" fill="#fff" opacity="0.4" />
      {/* Building */}
      <rect x="240" y="340" width="1120" height="150" fill="#f4f4f4" stroke="#2a2a3d" strokeWidth="2" />
      {/* Roof slab */}
      <rect x="200" y="328" width="1200" height="18" fill="#e0e0e0" stroke="#2a2a3d" strokeWidth="2" />
      {/* Arches/columns */}
      {Array.from({ length: 14 }).map((_, i) => {
        const x = 280 + i * 78
        return (
          <g key={i}>
            <path d={`M ${x} 490 L ${x} 380 Q ${x + 26} 340 ${x + 52} 380 L ${x + 52} 490 Z`} fill="#fff" stroke="#2a2a3d" strokeWidth="1.5" />
            <path d={`M ${x + 4} 488 L ${x + 4} 382 Q ${x + 26} 348 ${x + 48} 382 L ${x + 48} 488 Z`} fill="#3a3a5a" />
          </g>
        )
      })}
      {/* Side wing */}
      <rect x="700" y="280" width="200" height="60" fill="#f4f4f4" stroke="#2a2a3d" strokeWidth="2" />
      {/* Flag */}
      <line x1="800" y1="180" x2="800" y2="280" stroke="#fff" strokeWidth="3" />
      <rect x="800" y="180" width="60" height="40" fill="#1d8d3e" />
      <polygon points="810,200 830,184 850,200 830,216" fill="#ffd700" />
      <circle cx="830" cy="200" r="7" fill="#0033a0" />
      {/* Gold accents */}
      <rect x="240" y="338" width="1120" height="4" fill={accent} opacity="0.6" />
      {/* Sign */}
      <text x="800" y="312" fontSize="11" fill="#2a2a3d" textAnchor="middle" fontFamily="monospace" letterSpacing="3">
        PALÁCIO DO GOVERNO
      </text>
    </g>
  )
}

// ─── Banner com feature ─────────────────────────────────────────────────────

function FeatureBanner({ scene }: { scene: (typeof SCENES)[number] }) {
  return (
    <div className="absolute top-[18%] left-1/2 -translate-x-1/2 px-6 sm:px-10">
      <div
        className="hero-feature-banner inline-flex items-center gap-3 px-5 py-3 rounded-full backdrop-blur-md border shadow-2xl"
        style={{
          background: `linear-gradient(135deg, ${scene.accent}33, ${scene.accent}1a)`,
          borderColor: `${scene.accent}66`,
          boxShadow: `0 12px 40px ${scene.accent}33`,
        }}
      >
        <span className="text-2xl" style={{ color: scene.accent }}>
          {scene.icon}
        </span>
        <div className="text-left">
          <div className="text-white font-semibold text-base sm:text-lg leading-tight">
            {scene.feature}
          </div>
          <div className="text-white/70 text-xs sm:text-sm">{scene.sub}</div>
        </div>
      </div>
      <style jsx>{`
        :global(.hero-feature-banner) {
          animation: banner-pop 7s ease-out forwards;
          transform: translateY(20px);
          opacity: 0;
        }
        @keyframes banner-pop {
          0% { opacity: 0; transform: translateY(20px) scale(0.92); }
          12% { opacity: 1; transform: translateY(0) scale(1); }
          70% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-12px) scale(1); }
        }
      `}</style>
    </div>
  )
}

// ─── Personagem com walk cycle e troca de roupa ─────────────────────────────

function Character() {
  return (
    <div className="absolute bottom-[18%] left-1/2 -translate-x-1/2 hero-character-bob">
      <svg width="100" height="160" viewBox="0 0 100 160" className="overflow-visible">
        {/* Shadow */}
        <ellipse cx="50" cy="156" rx="22" ry="3" fill="#000" opacity="0.35" />
        {/* Cada outfit é mostrado só na sua janela */}
        <g className="hero-outfit" data-outfit="army">
          <Body scheme={{ uniform: '#3a4d2a', uniformDark: '#2a3a1a', accent: '#5a7a3a', skin: '#e0a878' }} hat="beret-army" />
        </g>
        <g className="hero-outfit" data-outfit="air">
          <Body scheme={{ uniform: '#2c5282', uniformDark: '#1a2d4a', accent: '#4a90d9', skin: '#e0a878' }} hat="cap-air" />
        </g>
        <g className="hero-outfit" data-outfit="civil">
          <Body scheme={{ uniform: '#5a4a3a', uniformDark: '#3a2a1a', accent: '#c9b176', skin: '#e0a878' }} hat="none" tie="#a02020" />
        </g>
        <g className="hero-outfit" data-outfit="suit">
          <Body scheme={{ uniform: '#1a1a2a', uniformDark: '#0a0a1a', accent: '#d4af37', skin: '#e0a878' }} hat="none" tie="#d4af37" briefcase />
        </g>
      </svg>

      <style jsx>{`
        :global(.hero-character-bob) {
          animation: bob 0.5s ease-in-out infinite;
        }
        :global(.hero-outfit) {
          opacity: 0;
          animation: outfit-show ${TOTAL_DURATION}s linear infinite;
        }
        :global(.hero-outfit[data-outfit='army']) { animation-delay: 0s; }
        :global(.hero-outfit[data-outfit='air']) { animation-delay: 7s; }
        :global(.hero-outfit[data-outfit='civil']) { animation-delay: 14s; }
        :global(.hero-outfit[data-outfit='suit']) { animation-delay: 21s; }

        @keyframes bob {
          0%, 100% { transform: translate(-50%, 0); }
          50% { transform: translate(-50%, -3px); }
        }

        @keyframes outfit-show {
          0% { opacity: 0; }
          3% { opacity: 1; }
          21% { opacity: 1; }
          24% { opacity: 0; }
          100% { opacity: 0; }
        }

        :global(.leg-anim-front) {
          transform-origin: 50px 95px;
          animation: leg-front 0.5s ease-in-out infinite;
        }
        :global(.leg-anim-back) {
          transform-origin: 50px 95px;
          animation: leg-back 0.5s ease-in-out infinite;
        }
        :global(.arm-anim-front) {
          transform-origin: 50px 60px;
          animation: arm-front 0.5s ease-in-out infinite;
        }
        :global(.arm-anim-back) {
          transform-origin: 50px 60px;
          animation: arm-back 0.5s ease-in-out infinite;
        }

        @keyframes leg-front {
          0%, 100% { transform: rotate(-15deg); }
          50% { transform: rotate(15deg); }
        }
        @keyframes leg-back {
          0%, 100% { transform: rotate(15deg); }
          50% { transform: rotate(-15deg); }
        }
        @keyframes arm-front {
          0%, 100% { transform: rotate(12deg); }
          50% { transform: rotate(-12deg); }
        }
        @keyframes arm-back {
          0%, 100% { transform: rotate(-12deg); }
          50% { transform: rotate(12deg); }
        }
      `}</style>
    </div>
  )
}

function Body({
  scheme,
  hat,
  tie,
  briefcase,
}: {
  scheme: { uniform: string; uniformDark: string; accent: string; skin: string }
  hat: 'beret-army' | 'cap-air' | 'none'
  tie?: string
  briefcase?: boolean
}) {
  return (
    <g>
      {/* Back leg */}
      <g className="leg-anim-back">
        <rect x="46" y="95" width="8" height="38" fill={scheme.uniformDark} rx="2" />
        <rect x="44" y="130" width="12" height="6" fill="#1a1a1a" rx="1" />
      </g>
      {/* Back arm */}
      <g className="arm-anim-back">
        <rect x="40" y="60" width="8" height="32" fill={scheme.uniformDark} rx="2" />
        <circle cx="44" cy="92" r="4" fill={scheme.skin} />
      </g>
      {/* Torso */}
      <rect x="38" y="58" width="24" height="42" fill={scheme.uniform} rx="3" />
      {/* Belt */}
      <rect x="38" y="93" width="24" height="4" fill={scheme.uniformDark} />
      <rect x="48" y="93" width="4" height="4" fill={scheme.accent} />
      {/* Tie (civil/suit) */}
      {tie && (
        <polygon points="50,58 47,62 50,90 53,62" fill={tie} stroke="#0a0a0a" strokeWidth="0.5" />
      )}
      {/* Lapels (civil/suit) */}
      {tie && (
        <>
          <polygon points="38,58 38,80 48,62" fill={scheme.uniformDark} />
          <polygon points="62,58 62,80 52,62" fill={scheme.uniformDark} />
        </>
      )}
      {/* Insignia/buttons */}
      {!tie && (
        <>
          <circle cx="50" cy="68" r="1.5" fill={scheme.accent} />
          <circle cx="50" cy="78" r="1.5" fill={scheme.accent} />
          <rect x="42" y="62" width="6" height="2" fill={scheme.accent} />
        </>
      )}
      {/* Front arm */}
      <g className="arm-anim-front">
        <rect x="52" y="60" width="8" height="32" fill={scheme.uniform} rx="2" />
        <circle cx="56" cy="92" r="4" fill={scheme.skin} />
        {briefcase && (
          <g>
            <rect x="62" y="86" width="22" height="14" fill={scheme.uniformDark} rx="1.5" stroke="#0a0a0a" strokeWidth="0.8" />
            <rect x="69" y="83" width="8" height="4" fill="none" stroke={scheme.uniformDark} strokeWidth="1.2" />
            <rect x="65" y="91" width="16" height="1.5" fill={scheme.accent} />
          </g>
        )}
      </g>
      {/* Front leg */}
      <g className="leg-anim-front">
        <rect x="46" y="95" width="8" height="38" fill={scheme.uniform} rx="2" />
        <rect x="44" y="130" width="12" height="6" fill="#1a1a1a" rx="1" />
      </g>
      {/* Neck */}
      <rect x="46" y="50" width="8" height="10" fill={scheme.skin} />
      {/* Head */}
      <circle cx="50" cy="42" r="11" fill={scheme.skin} stroke="#3a2a1a" strokeWidth="0.6" />
      {/* Eyes */}
      <circle cx="46" cy="42" r="0.9" fill="#1a1a1a" />
      <circle cx="54" cy="42" r="0.9" fill="#1a1a1a" />
      {/* Mouth */}
      <path d="M 47 47 Q 50 49 53 47" fill="none" stroke="#3a2a1a" strokeWidth="0.7" strokeLinecap="round" />
      {/* Hair shadow under hat */}
      {hat !== 'none' && <path d="M 40 38 Q 50 33 60 38 L 60 32 Q 50 28 40 32 Z" fill="#3a2a1a" />}
      {/* Hat */}
      {hat === 'beret-army' && (
        <g>
          <ellipse cx="50" cy="32" rx="13" ry="5" fill={scheme.uniformDark} />
          <ellipse cx="50" cy="30" rx="11" ry="4" fill={scheme.uniform} />
          <circle cx="44" cy="30" r="1.5" fill={scheme.accent} />
        </g>
      )}
      {hat === 'cap-air' && (
        <g>
          <rect x="38" y="30" width="24" height="6" fill={scheme.uniform} rx="1" />
          <ellipse cx="50" cy="30" rx="13" ry="3" fill={scheme.uniform} />
          <rect x="42" y="36" width="16" height="2" fill={scheme.uniformDark} />
          <text x="50" y="35" fontSize="3" fill={scheme.accent} textAnchor="middle" fontWeight="bold">★</text>
        </g>
      )}
    </g>
  )
}

// ─── Chão ───────────────────────────────────────────────────────────────────

function Ground() {
  return (
    <div className="absolute inset-x-0 bottom-0 h-[18%] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0a]/40 to-[#0a0a0a]" />
      <div className="absolute inset-0 hero-ground-scroll">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 80px)',
          }}
        />
      </div>
      <style jsx>{`
        :global(.hero-ground-scroll) {
          animation: ground-scroll 0.8s linear infinite;
        }
        @keyframes ground-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-80px); }
        }
      `}</style>
    </div>
  )
}

// ─── Final: Bandeira + Mapa Brasil ──────────────────────────────────────────

function BrazilFinale({ static: isStatic }: { static?: boolean } = {}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1d8d3e] via-[#0a3d20] to-[#1A1C1F]">
      {/* Brazil flag big background */}
      <svg
        viewBox="0 0 720 504"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full opacity-25"
      >
        <rect width="720" height="504" fill="#1d8d3e" />
        <polygon points="360,38 670,252 360,466 50,252" fill="#ffd700" />
        <circle cx="360" cy="252" r="120" fill="#0033a0" />
        <path
          d="M 250 240 Q 360 280 470 240"
          fill="none"
          stroke="#fff"
          strokeWidth="14"
        />
      </svg>
      {/* Brasil silhouette overlay */}
      <svg
        viewBox="0 0 800 800"
        className="relative w-[60%] max-w-[480px] h-auto opacity-90"
        style={{ filter: 'drop-shadow(0 8px 32px rgba(255,215,0,0.4))' }}
      >
        {/* Mapa Brasil simplificado — silhueta estilizada */}
        <path
          d="M 320 90 L 380 95 L 440 110 L 490 130 L 540 150 L 580 180 L 605 220 L 615 270 L 625 330 L 615 380 L 590 430 L 605 480 L 625 520 L 645 560 L 660 605 L 645 650 L 605 685 L 540 705 L 460 710 L 380 695 L 310 660 L 250 615 L 210 555 L 180 490 L 165 425 L 175 360 L 200 300 L 230 245 L 255 195 L 275 145 L 300 110 Z"
          fill="rgba(255, 215, 0, 0.15)"
          stroke="#ffd700"
          strokeWidth="3"
          strokeLinejoin="round"
          className={isStatic ? '' : 'hero-map-draw'}
        />
        {/* Pontos espalhados representando licitações */}
        {[
          [380, 230], [450, 290], [510, 240], [430, 360], [500, 380],
          [380, 450], [310, 380], [330, 290], [560, 470], [340, 540],
          [430, 570], [510, 530], [400, 620], [320, 460], [550, 350],
        ].map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r="6"
            fill="#F43E01"
            opacity="0.9"
            className={isStatic ? '' : 'hero-pin-pulse'}
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </svg>
      {/* Texto final */}
      <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 text-center w-full px-4">
        <p className="text-white font-mono text-xs sm:text-sm uppercase tracking-[0.4em] mb-2 opacity-80">
          Licitagram
        </p>
        <p className="text-white text-lg sm:text-2xl font-light max-w-md mx-auto">
          IA pra licitações em todo o Brasil
        </p>
      </div>
      <style jsx>{`
        :global(.hero-map-draw) {
          stroke-dasharray: 3000;
          stroke-dashoffset: 3000;
          animation: map-draw 2.5s ease-out forwards;
        }
        :global(.hero-pin-pulse) {
          animation: pin-pulse 1.4s ease-in-out infinite;
        }
        @keyframes map-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes pin-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
