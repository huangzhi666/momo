'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface IgnoredState {
  ignored: string[]
  ignore: (lemma: string) => void
  unignore: (lemma: string) => void
  clear: () => void
}

export const useIgnoredStore = create<IgnoredState>()(
  persist(
    (set) => ({
      ignored: [],
      ignore: (lemma) =>
        set((state) => ({
          ignored: state.ignored.includes(lemma) ? state.ignored : [...state.ignored, lemma],
        })),
      unignore: (lemma) =>
        set((state) => ({ ignored: state.ignored.filter((item) => item !== lemma) })),
      clear: () => set({ ignored: [] }),
    }),
    {
      name: 'lexiloop-ignored',
      skipHydration: true,
    },
  ),
)
