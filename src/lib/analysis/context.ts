import { type OxfordMode } from '@/lib/constants'
import { getVocabMap } from '@/lib/db/queries'
import { getDefaultOxfordMode } from '@/lib/settings'
import { isFunctionWord, isProperNounWord, getOxfordLevel, spellingVariants } from '@/lib/dict/basic'
import { getEcdictEntry } from '@/lib/dict/ecdict'
import { lemmaCandidates, resolveLemma } from '@/lib/dict/lemma'
import type { ClassifyDeps } from '@/lib/text/classify'

export function getOxfordMode(): OxfordMode {
  return getDefaultOxfordMode()
}

export function createClassifyDeps(
  level: ClassifyDeps['level'],
  oxfordMode: OxfordMode = getOxfordMode(),
): ClassifyDeps {
  const vocabRecords = getVocabMap()
  const vocab = new Map<string, { lastResponse: string | null; tags: string[] }>()
  for (const [lemma, record] of vocabRecords) {
    vocab.set(lemma, { lastResponse: record.lastResponse, tags: record.tags })
  }
  return {
    level,
    oxfordMode,
    vocab,
    resolveLemma,
    lemmaCandidates,
    getEntry: getEcdictEntry,
    isFunctionWord,
    isProperNounWord,
    getOxfordLevel,
    spellingVariants,
  }
}
