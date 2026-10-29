import type { Level, OxfordMode } from '@/lib/constants'
import { LEVEL_META } from '@/lib/constants'
import type { EcdictEntry } from '@/lib/dict/ecdict'
import type { TokenStatus } from '@/lib/types'

export interface VocabInfo {
  lastResponse: string | null
  tags: string[]
}

export interface ClassifyDeps {
  level: Level
  oxfordMode: OxfordMode
  vocab: Map<string, VocabInfo>
  resolveLemma(surface: string): string
  lemmaCandidates(surface: string): string[]
  getEntry(word: string): EcdictEntry | null
  isFunctionWord(word: string): boolean
  isProperNounWord(word: string): boolean
  getOxfordLevel(word: string): string | undefined
  spellingVariants(word: string): string[]
}

export interface ClassifyInput {
  surface: string
  sentenceInitial: boolean
}

export interface ClassifyResult {
  status: TokenStatus
  lemma: string
  normalized: string
  knownResponse: string | null
}

function isCapitalized(word: string): boolean {
  const first = [...word][0]
  return Boolean(first && first === first.toUpperCase() && first !== first.toLowerCase())
}

function isAllCaps(word: string): boolean {
  const letters = word.replace(/[^A-Za-z]/g, '')
  return letters.length >= 2 && letters === letters.toUpperCase()
}

/**
 * 标注规则（命中即停）：
 * 非单词 → 专名 → Oxford/基础词 → 已选词库 → 难度带内（生词）→ 超纲。
 * Oxford 3000 优先于已选词库：Oxford 词永不标注。
 */
export function classifyWord(input: ClassifyInput, deps: ClassifyDeps): ClassifyResult {
  const normalized = input.surface
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .toLowerCase()
  const lemma = deps.resolveLemma(input.surface)
  const candidates = new Set<string>([
    ...deps.lemmaCandidates(input.surface),
    lemma,
    normalized,
  ])
  for (const candidate of [...candidates]) {
    for (const variant of deps.spellingVariants(candidate)) candidates.add(variant)
  }

  if (!normalized) {
    return { status: 'ignored', lemma, normalized, knownResponse: null }
  }
  if (normalized.length === 1 && normalized !== 'a' && normalized !== 'i') {
    return { status: 'ignored', lemma, normalized, knownResponse: null }
  }
  // a.m / p.m / e.g / i.e 等带点缩写，以及 etc，不属于词汇学习对象。
  if (/^[a-z]\.[a-z]\.?$/.test(normalized) || normalized === 'etc') {
    return { status: 'ignored', lemma, normalized, knownResponse: null }
  }

  const functionHit = [...candidates].some((c) => deps.isFunctionWord(c))
  const oxfordHit =
    deps.oxfordMode !== 'off' &&
    [...candidates].some((c) => Boolean(deps.getOxfordLevel(c)))
  const ecdictOxfordHit =
    deps.oxfordMode !== 'off' &&
    [...candidates].some((c) => (deps.getEntry(c)?.oxford ?? 0) > 0)
  const isBasic = functionHit || oxfordHit || ecdictOxfordHit

  const properListed = [...candidates].some((c) => deps.isProperNounWord(c))
  const hasDictionaryEntry = [...candidates].some((c) => Boolean(deps.getEntry(c)))
  const capitalized = isCapitalized(input.surface)

  if (!isBasic && normalized !== 'i') {
    if (capitalized && (properListed || !input.sentenceInitial || !hasDictionaryEntry)) {
      return { status: 'proper', lemma, normalized, knownResponse: null }
    }
    if (capitalized && isAllCaps(input.surface) && normalized.length > 1) {
      return { status: 'proper', lemma, normalized, knownResponse: null }
    }
  }

  if (isBasic) {
    return { status: 'basic', lemma, normalized, knownResponse: null }
  }

  let knownResponse: string | null = null
  let knownHit = false
  for (const candidate of candidates) {
    const info = deps.vocab.get(candidate)
    if (info) {
      knownHit = true
      if (info.lastResponse === 'FORGET' || info.lastResponse === 'VAGUE') {
        knownResponse = info.lastResponse
        break
      }
      if (!knownResponse) knownResponse = info.lastResponse
    }
  }
  if (knownHit) {
    return { status: 'known', lemma, normalized, knownResponse }
  }

  const bandTags = new Set(LEVEL_META[deps.level].tags)
  const inBand = [...candidates].some((candidate) => {
    const entry = deps.getEntry(candidate)
    if (!entry?.tag) return false
    return entry.tag
      .toLowerCase()
      .split(/\s+/)
      .some((tag) => bandTags.has(tag))
  })

  return {
    status: inBand ? 'new' : 'out_of_band',
    lemma,
    normalized,
    knownResponse: null,
  }
}
