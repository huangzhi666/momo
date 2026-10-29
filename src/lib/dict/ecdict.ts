import { getRawDb } from '@/lib/db'
import { normalizeSurface } from '@/lib/text/lemma'

export interface EcdictEntry {
  word: string
  phonetic: string | null
  translation: string | null
  definition: string | null
  pos: string | null
  tag: string | null
  frq: number | null
  bnc: number | null
  oxford: number
  collins: number | null
  exchange: string | null
  detail: string | null
}

const MAX_CACHE = 40_000
const entryCache = new Map<string, EcdictEntry | null>()
const lemmaCache = new Map<string, string | null>()

function cacheSet<T>(map: Map<string, T>, key: string, value: T): T {
  map.set(key, value)
  if (map.size > MAX_CACHE) {
    const oldest = map.keys().next().value
    if (oldest !== undefined) map.delete(oldest)
  }
  return value
}

export function getEcdictEntry(word: string): EcdictEntry | null {
  const key = normalizeSurface(word)
  if (!key) return null
  if (entryCache.has(key)) return entryCache.get(key) ?? null
  let statement: ReturnType<ReturnType<typeof getRawDb>['prepare']> | null = null
  try {
    statement = getRawDb().prepare(
      'SELECT word, phonetic, translation, definition, pos, tag, frq, bnc, oxford, collins, exchange, detail FROM ecdict WHERE word = ?',
    )
    const row = statement.get(key) as EcdictEntry | undefined
    return cacheSet(entryCache, key, row ?? null)
  } catch {
    return null
  }
}

export function hasEcdictWord(word: string): boolean {
  return getEcdictEntry(word) !== null
}

export function getLemmaMapping(surface: string): string | null {
  const key = normalizeSurface(surface)
  if (!key) return null
  if (lemmaCache.has(key)) return lemmaCache.get(key) ?? null
  try {
    const row = getRawDb().prepare('SELECT lemma FROM lemma_map WHERE surface = ?').get(key) as
      | { lemma: string }
      | undefined
    return cacheSet(lemmaCache, key, row?.lemma ?? null)
  } catch {
    return null
  }
}

export function getPosOf(word: string): string | null {
  return getEcdictEntry(word)?.pos ?? null
}

export function getEcdictCount(): number {
  try {
    const row = getRawDb().prepare('SELECT count(*) AS c FROM ecdict').get() as { c: number }
    return Number(row?.c ?? 0)
  } catch {
    return 0
  }
}

export function getLemmaMapCount(): number {
  try {
    const row = getRawDb().prepare('SELECT count(*) AS c FROM lemma_map').get() as { c: number }
    return Number(row?.c ?? 0)
  } catch {
    return 0
  }
}

export function clearDictionaryCaches(): void {
  entryCache.clear()
  lemmaCache.clear()
}

export interface ExchangeForm {
  label: string
  value: string
}

const EXCHANGE_LABELS: Record<string, string> = {
  p: '过去式',
  d: '过去分词',
  i: '现在分词',
  '3': '第三人称单数',
  r: '比较级',
  t: '最高级',
  s: '复数',
  '0': '原形',
  '1': '变换',
}

export function parseExchange(exchange: string | null | undefined): ExchangeForm[] {
  if (!exchange) return []
  const forms: ExchangeForm[] = []
  for (const part of exchange.split('/')) {
    const idx = part.indexOf(':')
    if (idx <= 0) continue
    const code = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!value) continue
    const label = EXCHANGE_LABELS[code]
    if (!label) continue
    forms.push({ label, value })
  }
  return forms
}

export function getEntryTags(entry: EcdictEntry | null): string[] {
  if (!entry?.tag) return []
  return entry.tag
    .split(/\s+/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}

export function entryMatchesTags(entry: EcdictEntry | null, tags: string[]): boolean {
  if (!entry) return false
  const set = new Set(tags)
  return getEntryTags(entry).some((tag) => set.has(tag))
}

export function getFrequency(entry: EcdictEntry | null): number | null {
  if (!entry) return null
  if (entry.frq && entry.frq > 0) return entry.frq
  if (entry.bnc && entry.bnc > 0) return entry.bnc
  return null
}

export function getWordMetadata(word: string): {
  entry: EcdictEntry | null
  tags: string[]
  frq: number | null
} {
  const entry = getEcdictEntry(word)
  return { entry, tags: getEntryTags(entry), frq: getFrequency(entry) }
}
