/**
 * useHero3DStore — estado global da timeline cinematográfica.
 * Compartilhado entre Canvas (R3F) e overlay HTML (botão pular, etc).
 */

import { create } from 'zustand'
import { TOTAL_DURATION, SCENE_TIMINGS, type SceneId } from './constants'

type Hero3DState = {
  elapsed: number
  scene: SceneId
  finished: boolean
  reducedMotion: boolean
  setElapsed: (s: number) => void
  skip: () => void
  reset: () => void
  setReducedMotion: (v: boolean) => void
}

function sceneFromElapsed(t: number): SceneId {
  const entries = Object.entries(SCENE_TIMINGS) as [SceneId, { start: number; end: number }][]
  for (const [id, { start, end }] of entries) {
    if (t >= start && t < end) return id
  }
  return 'finale'
}

export const useHero3DStore = create<Hero3DState>((set) => ({
  elapsed: 0,
  scene: 'army',
  finished: false,
  reducedMotion: false,
  setElapsed: (s) =>
    set(() => ({
      elapsed: s,
      scene: sceneFromElapsed(s),
      finished: s >= TOTAL_DURATION,
    })),
  skip: () =>
    set(() => ({
      elapsed: TOTAL_DURATION,
      scene: 'finale',
      finished: true,
    })),
  reset: () =>
    set(() => ({
      elapsed: 0,
      scene: 'army',
      finished: false,
    })),
  setReducedMotion: (v) => set({ reducedMotion: v }),
}))
