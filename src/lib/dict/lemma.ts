import { getEcdictEntry, getLemmaMapping, getPosOf, hasEcdictWord } from '@/lib/dict/ecdict'
import { lemmaCandidates as buildCandidates, resolveLemmaWith } from '@/lib/text/lemma'
import { getOxfordLevel, isFunctionWord, spellingVariants } from '@/lib/dict/basic'

const resolveCache = new Map<string, string>()

export function resolveLemma(surface: string): string {
  const key = surface.trim().toLowerCase()
  if (resolveCache.has(key)) return resolveCache.get(key) as string
  const lemma = resolveLemmaWith(surface, {
    lookupMap: (word) => getLemmaMapping(word) ?? undefined,
    exists: (word) => hasEcdictWord(word),
    posOf: (word) => getPosOf(word),
    isBasicHeadword: (word) =>
      isFunctionWord(word) ||
      Boolean(getOxfordLevel(word)) ||
      (getEcdictEntry(word)?.oxford ?? 0) > 0,
  })
  if (resolveCache.size > 40_000) resolveCache.clear()
  resolveCache.set(key, lemma)
  return lemma
}

export function lemmaCandidates(surface: string): string[] {
  const resolved = resolveLemma(surface)
  const candidates = buildCandidates(surface, resolved)
  const set = new Set(candidates)
  for (const word of [...set]) {
    for (const variant of spellingVariants(word)) set.add(variant)
  }
  return [...set]
}

export function isBasicWord(word: string): boolean {
  return isFunctionWord(word)
}

export function clearLemmaCache(): void {
  resolveCache.clear()
}
