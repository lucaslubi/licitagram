/**
 * constants.ts — paleta + timing global do hero 3D cinematográfico.
 *
 * Identidade: azul institucional brasileiro. Verde/amarelo APENAS no finale.
 */

export const COLORS = {
  // Tons primários — azul institucional
  abyssBlue:  '#0A1A3F',
  navalBlue:  '#102B5E',
  royalBlue:  '#1E40AF',
  skyBlue:    '#3B82F6',
  iceBlue:    '#93C5FD',

  // Acentos finale
  brazilGreen:  '#009C3B',
  brazilYellow: '#FFDF00',

  // Neutros premium
  platinum: '#E5E7EB',
  gold:     '#D4AF37',

  // UI / banners
  bannerBg:     'rgba(10, 26, 63, 0.85)',
  bannerStroke: '#3B82F6',
} as const

export const TOTAL_DURATION = 30 // seconds

export const SCENE_TIMINGS = {
  army:    { start: 0,  end: 6  },
  airforce:{ start: 6,  end: 12 },
  cityhall:{ start: 12, end: 18 },
  federal: { start: 18, end: 24 },
  finale:  { start: 24, end: 30 },
} as const

export type SceneId = keyof typeof SCENE_TIMINGS

export const OUTFITS: Record<SceneId, { primary: string; accent: string; trim: string }> = {
  army:     { primary: '#3F5641', accent: '#2A3B2D', trim: COLORS.iceBlue },
  airforce: { primary: COLORS.skyBlue, accent: '#1F4E79', trim: COLORS.gold },
  cityhall: { primary: COLORS.royalBlue, accent: '#FFFFFF', trim: '#0F1B3A' },
  federal:  { primary: '#0E1430', accent: COLORS.gold, trim: '#FFFFFF' },
  finale:   { primary: '#0E1430', accent: COLORS.gold, trim: '#FFFFFF' },
}

// Câmera: 12 shots ao longo de 30s, easing power2.inOut
export type CameraShot = {
  t: number
  pos: [number, number, number]
  look: [number, number, number]
  fov?: number
}

export const CAMERA_SHOTS: CameraShot[] = [
  // Army 0–6
  { t: 0,  pos: [0, 6, 14],  look: [0, 1.5, 0],   fov: 50 },
  { t: 2,  pos: [-8, 2.5, 6], look: [0, 1.5, 0],  fov: 45 },
  { t: 4,  pos: [3, 1, 4],   look: [0, 1.8, 0],   fov: 40 }, // low-angle salute
  // Crane up para Aero (6–8)
  { t: 6,  pos: [0, 12, 16], look: [0, 2, -8],    fov: 55 },
  // Airforce 8–12
  { t: 8,  pos: [-5, 3, 10], look: [0, 2, 0],     fov: 45 }, // dolly-in avião
  { t: 10, pos: [4, 3.5, 5], look: [-2, 4, -10],  fov: 40 }, // OTS olhando céu
  // City hall 12–14
  { t: 12, pos: [0, 5, 14],  look: [0, 2, 0],     fov: 50 },
  { t: 14, pos: [10, 3, 4],  look: [0, 2, 0],     fov: 45 }, // 360 lento
  { t: 16, pos: [1, 1.6, 3], look: [0, 1.7, 0],   fov: 30 }, // close gravata
  // Federal 18–22
  { t: 18, pos: [0, 6, 18],  look: [0, 3, 0],     fov: 55 },
  { t: 22, pos: [0.5, 1.8, 4], look: [0, 1.7, 0], fov: 28 }, // push-in face
  // Finale 24–30
  { t: 24, pos: [0, 4, 12],  look: [0, 2, 0],     fov: 50 },
  { t: 30, pos: [0, 8, 24],  look: [0, 3, -2],    fov: 60 }, // pull-back
]

// Banners: 8 letreiros sincronizados com a timeline
export type BannerCue = {
  t: number       // segundos
  duration: number
  text: string
  icon: 'sparkles' | 'shield' | 'workflow' | 'search' | 'eye' | 'network' | 'scale' | 'branch'
  position: [number, number, number] // mundo 3D
}

export const BANNERS: BannerCue[] = [
  { t: 1.5,  duration: 2.5, text: 'Análise automática de editais com IA',         icon: 'search',   position: [3, 3, 0] },
  { t: 4,    duration: 1.5, text: 'Conformidade Lei 14.133/2021 nativa',          icon: 'scale',    position: [-3, 3.5, 1] },
  { t: 7,    duration: 2.5, text: 'DFD, ETP e TR gerados em minutos',             icon: 'sparkles', position: [3, 4, 0] },
  { t: 10,   duration: 2,   text: 'Auto-Pilot™ — fluxo completo da fase interna', icon: 'workflow', position: [-3, 3.5, 0] },
  { t: 13,   duration: 2.5, text: 'Auditoria contínua em tempo real',             icon: 'eye',      position: [3, 4, 0] },
  { t: 16,   duration: 1.5, text: 'Integração PNCP nativa',                       icon: 'network',  position: [-3, 3.5, 0] },
  { t: 19,   duration: 2.5, text: 'Conhecimento jurídico embarcado',              icon: 'branch',   position: [3, 4, 0] },
  { t: 22,   duration: 1.5, text: 'Decisões rastreáveis e defensáveis',           icon: 'shield',   position: [-3, 3.5, 0] },
]
