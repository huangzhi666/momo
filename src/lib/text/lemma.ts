import { getIrregularLemma, isFunctionWord, spellingVariants } from '@/lib/dict/basic'

export function normalizeApostrophes(text: string): string {
  return text.replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"')
}

export function normalizeSurface(surface: string): string {
  return normalizeApostrophes(surface).trim().toLowerCase()
}

export function stripPossessive(word: string): string {
  if (word.endsWith("'s")) return word.slice(0, -2)
  if (word.endsWith("'")) return word.slice(0, -1)
  return word
}

export const CONTRACTIONS: Record<string, string> = {
  "don't": 'do',
  "doesn't": 'do',
  "didn't": 'do',
  "won't": 'will',
  "wouldn't": 'will',
  "can't": 'can',
  "cannot": 'can',
  "couldn't": 'can',
  "shouldn't": 'should',
  "mustn't": 'must',
  "needn't": 'need',
  "isn't": 'be',
  "aren't": 'be',
  "wasn't": 'be',
  "weren't": 'be',
  "hasn't": 'have',
  "haven't": 'have',
  "hadn't": 'have',
  "it's": 'it',
  "that's": 'that',
  "there's": 'there',
  "here's": 'here',
  "what's": 'what',
  "who's": 'who',
  "where's": 'where',
  "when's": 'when',
  "how's": 'how',
  "let's": 'let',
  "i'm": 'i',
  "i've": 'i',
  "i'll": 'i',
  "i'd": 'i',
  "you're": 'you',
  "you've": 'you',
  "you'll": 'you',
  "you'd": 'you',
  "we're": 'we',
  "we've": 'we',
  "we'll": 'we',
  "we'd": 'we',
  "they're": 'they',
  "they've": 'they',
  "they'll": 'they',
  "they'd": 'they',
  "he's": 'he',
  "he'd": 'he',
  "he'll": 'he',
  "she's": 'she',
  "she'd": 'she',
  "she'll": 'she',
  "o'clock": "o'clock",
}

export interface LemmaDeps {
  lookupMap(surface: string): string | undefined
  exists(word: string): boolean
  posOf(word: string): string | null
  /** 该词本身是否是 Oxford 3000 / 基础词条（用于阻止规则回退误伤独立词）。 */
  isBasicHeadword?(word: string): boolean
}

/**
 * 已经是独立词条的常见词，禁止套用 -s/-es/-ing 规则。
 * 这些词没有 -ss 结尾，规则回退时容易误伤（species → spec 等）。
 */
const PROTECTED_HEADS = new Set([
  'species',
  'series',
  'corps',
  'clothes',
  'physics',
  'mathematics',
  'economics',
  'politics',
  'ethics',
  'statistics',
  'athletics',
  'gymnastics',
  'linguistics',
  'electronics',
  'genetics',
  'mechanics',
  'optics',
  'acoustics',
  'measles',
  'diabetes',
  'rabies',
  'headquarters',
  'scissors',
  'trousers',
  'thanks',
  'regards',
  'premises',
  'goods',
  'savings',
  'belongings',
  'surroundings',
  'earnings',
  'outskirts',
  'customs',
  'means',
  'news',
  'chaos',
  'cosmos',
  'lens',
  'plus',
  'minus',
  'bus',
  'gas',
  'canvas',
  'atlas',
  'bias',
  'christmas',
  // 已经名词化/形容词化的 -ing 形式，按独立词处理（Oxford 里也多有收录）
  'evening',
  'building',
  'clothing',
  'meeting',
  'feeling',
  'meaning',
  'opening',
  'ending',
  'beginning',
  'painting',
  'drawing',
  'writing',
  'reading',
  'cooking',
  'shopping',
  'parking',
  'housing',
  'warning',
  'training',
  'wedding',
  'ceiling',
  'pudding',
  'darling',
  'sibling',
  'following',
  'understanding',
  'willing',
  'unwilling',
  'leading',
  'living',
  'lighting',
  'heating',
  'seating',
  'landing',
  'bearing',
  'dwelling',
  'filling',
  // 以 -ed 结尾但并非屈折形式的常见独立词
  'shed',
  'seed',
  'feed',
  'need',
  'speed',
  'weed',
  'deed',
  'reed',
  'breed',
  'creed',
  'greed',
  'steed',
  'jagged',
  'ragged',
  'rugged',
  'crooked',
  'wicked',
  'naked',
  'sacred',
  'hatred',
  'kindred',
  'wretched',
  'blessed',
  'learned',
  'aged',
  'dogged',
  'cursed',
  'beloved',
])

export interface LemmaCandidate {
  lemma: string
  reason: string
}

function posTokens(pos: string | null): string[] {
  if (!pos) return []
  return pos
    .split(/[\s,:;/]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
}

function hasPos(pos: string | null, ...wanted: string[]): boolean {
  const tokens = posTokens(pos)
  return wanted.some((w) => tokens.includes(w))
}

function hasAnyPos(pos: string | null): boolean {
  return posTokens(pos).length > 0
}

/** 只查自有属性，避免 "constructor"/"toString" 命中 Object.prototype。 */
function contractionOf(word: string): string | undefined {
  return Object.hasOwn(CONTRACTIONS, word) ? CONTRACTIONS[word] : undefined
}

/**
 * 屈折还原候选（不含派生）。顺序即优先级。
 * 只生成候选，是否接受由 exists / POS 校验决定。
 */
export function inflectedCandidates(surface: string): LemmaCandidate[] {
  const w = surface
  const out: LemmaCandidate[] = []
  const add = (lemma: string, reason: string) => {
    if (lemma.length >= 2 && lemma !== w && !out.some((c) => c.lemma === lemma)) {
      out.push({ lemma, reason })
    }
  }

  // 复数 / 第三人称单数
  if (w.endsWith('ies') && w.length > 4) add(`${w.slice(0, -3)}y`, 'plural-ies')
  if (w.endsWith('ves') && w.length > 4) {
    add(`${w.slice(0, -3)}f`, 'plural-ves-f')
    add(`${w.slice(0, -3)}fe`, 'plural-ves-fe')
  }
  if (/(?:s|x|z|ch|sh)es$/.test(w)) add(w.slice(0, -2), 'plural-es')
  if (w.endsWith('es') && w.length > 3) add(w.slice(0, -2), 'plural-es-generic')
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) {
    add(w.slice(0, -1), 'plural-s')
  }

  // 过去式 / 过去分词
  if (w.endsWith('ied') && w.length > 4) add(`${w.slice(0, -3)}y`, 'past-ied')
  if (w.endsWith('ed') && w.length > 3) {
    add(w.slice(0, -2), 'past-ed')
    add(w.slice(0, -1), 'past-d')
    const stem = w.slice(0, -2)
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) add(stem.slice(0, -1), 'past-double')
  }

  // 现在分词
  if (w.endsWith('ing') && w.length > 4) {
    add(w.slice(0, -3), 'ing')
    add(`${w.slice(0, -3)}e`, 'ing-e')
    const stem = w.slice(0, -3)
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) add(stem.slice(0, -1), 'ing-double')
    if (stem.length > 1 && /[^aeiou][aeiou][^aeiouwxy]$/.test(stem)) add(`${stem}e`, 'ing-cvc-e')
  }

  // 比较级 / 最高级
  if (w.endsWith('ier') && w.length > 4) add(`${w.slice(0, -3)}y`, 'comparative-ier')
  if (w.endsWith('iest') && w.length > 5) add(`${w.slice(0, -4)}y`, 'superlative-iest')
  if (w.endsWith('er') && w.length > 3) {
    add(w.slice(0, -2), 'comparative-er')
    add(w.slice(0, -1), 'comparative-r')
  }
  if (w.endsWith('est') && w.length > 4) {
    add(w.slice(0, -3), 'superlative-est')
    add(w.slice(0, -2), 'superlative-st')
  }

  return out
}

const SUFFIX_GATE: Record<string, { surface: string[]; candidate: string[] } | null> = {
  'plural-ies': { surface: ['n'], candidate: ['n'] },
  'plural-ves-f': { surface: ['n'], candidate: ['n'] },
  'plural-ves-fe': { surface: ['n'], candidate: ['n'] },
  'plural-es': { surface: ['n', 'v'], candidate: ['n', 'v'] },
  'plural-es-generic': { surface: ['n', 'v'], candidate: ['n', 'v'] },
  'plural-s': { surface: ['n', 'v'], candidate: ['n', 'v'] },
  'past-ied': { surface: ['v'], candidate: ['v'] },
  'past-ed': { surface: ['v', 'adj'], candidate: ['v'] },
  'past-d': { surface: ['v', 'adj'], candidate: ['v'] },
  'past-double': { surface: ['v', 'adj'], candidate: ['v'] },
  ing: { surface: ['v', 'n', 'adj'], candidate: ['v'] },
  'ing-e': { surface: ['v', 'n', 'adj'], candidate: ['v'] },
  'ing-double': { surface: ['v', 'n', 'adj'], candidate: ['v'] },
  'ing-cvc-e': { surface: ['v', 'n', 'adj'], candidate: ['v'] },
  'comparative-ier': { surface: ['adj', 'adv'], candidate: ['adj', 'adv'] },
  'superlative-iest': { surface: ['adj', 'adv'], candidate: ['adj', 'adv'] },
  'comparative-er': { surface: ['adj', 'adv'], candidate: ['adj', 'adv'] },
  'comparative-r': { surface: ['adj', 'adv'], candidate: ['adj', 'adv'] },
  'superlative-est': { surface: ['adj', 'adv'], candidate: ['adj', 'adv'] },
  'superlative-st': { surface: ['adj', 'adv'], candidate: ['adj', 'adv'] },
}

/**
 * 解析 lemma。只做屈折还原，不做派生还原。
 * 顺序：缩写 → 所有格 → 不规则表 → ECDICT lemma_map → 规则回退。
 */
export function resolveLemmaWith(surface: string, deps: LemmaDeps): string {
  let word = normalizeSurface(surface)
  if (!word) return word

  const contraction = contractionOf(word)
  if (contraction) return contraction

  const stripped = stripPossessive(word)
  if (stripped !== word) {
    word = stripped
    const strippedContraction = contractionOf(word)
    if (strippedContraction) return strippedContraction
  }

  const irregular = getIrregularLemma(word)
  if (irregular) return irregular

  // 功能词优先原样返回，避免 as → a、this → thi 之类的规则误伤。
  if (isFunctionWord(word)) return word
  if (PROTECTED_HEADS.has(word)) return word

  const mapped = deps.lookupMap(word)
  if (mapped) return mapped

  // 本身是独立基础词（teacher / water / corner / always）时，不再套用屈折规则。
  // 注意：running、studies 等有 lemma_map 的形式已在上面返回，不受影响。
  if (deps.isBasicHeadword?.(word)) return word

  const surfacePos = deps.posOf(word)
  const surfaceHasPos = hasAnyPos(surfacePos)

  for (const candidate of inflectedCandidates(word)) {
    if (!deps.exists(candidate.lemma)) continue
    const gate = SUFFIX_GATE[candidate.reason]
    if (gate) {
      const isComparative =
        candidate.reason.includes('comparative') || candidate.reason.includes('superlative')
      if (isComparative) {
        // 比较级 / 最高级只接受明确标注为 adj/adv 的原形，避免 teacher → teach。
        const candPos = deps.posOf(candidate.lemma)
        if (!hasPos(candPos, 'adj', 'adv')) continue
        if (surfaceHasPos && !hasPos(surfacePos, 'adj', 'adv')) continue
      } else {
        if (surfaceHasPos && !hasPos(surfacePos, ...gate.surface)) continue
        const candPos = deps.posOf(candidate.lemma)
        if (hasAnyPos(candPos) && !hasPos(candPos, ...gate.candidate)) continue
      }
    }
    return candidate.lemma
  }

  return word
}

/** 用于分类的候选集合：原形、原词形、英美变体。 */
export function lemmaCandidates(surface: string, resolved: string): string[] {
  const normalized = normalizeSurface(surface)
  const stripped = stripPossessive(normalized)
  const bases = [resolved, stripped, normalized, contractionOf(normalized) ?? ''].filter(Boolean)
  const all = new Set<string>()
  for (const base of bases) {
    all.add(base)
    for (const variant of spellingVariants(base)) all.add(variant)
  }
  return [...all]
}
