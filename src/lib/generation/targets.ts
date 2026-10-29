import type { Genre, Level } from '@/lib/constants'
import { GENRE_META, GENRES, NEW_WORD_DENSITY_CAP, TOPIC_POOL } from '@/lib/constants'
import { getRawDb } from '@/lib/db'
import type { VocabRecord } from '@/lib/db/queries'
import { getEcdictEntry, getEntryTags } from '@/lib/dict/ecdict'
import {
  getOxfordLevel,
  isFunctionWord,
  isProperNounWord,
  spellingVariants,
} from '@/lib/dict/basic'
import { resolveLemma } from '@/lib/dict/lemma'
import { splitSenses } from '@/lib/utils'

export interface TargetWord {
  lemma: string
  spelling: string
  gloss: string
  weight: number
}

export function maxNewWordsForLength(length: number): number {
  return Math.max(1, Math.floor(length * NEW_WORD_DENSITY_CAP))
}

function daysSince(iso: string | null): number {
  if (!iso) return 180
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 180
  return Math.max(0, (Date.now() - then) / 86_400_000)
}

export function targetWeight(record: VocabRecord): number {
  let weight = 1
  const tags = record.tags.map((t) => t.toUpperCase())
  if (record.lastResponse === 'FORGET' || record.lastResponse === 'VAGUE') weight *= 8
  else if (tags.includes('STICKING')) weight *= 4
  else if (record.lastResponse === 'WELL_FAMILIAR') weight *= 0.6
  else if (record.lastResponse === 'FAMILIAR') weight *= 1.2

  weight *= 1 + 24 / (Math.max(0, record.studyCount) + 2)
  weight *= 1 + Math.min(daysSince(record.lastStudyDate), 365) / 120
  return weight
}

export function selectTargets(
  records: VocabRecord[],
  options: {
    count: number
    excludeLemmas?: string[]
    random?: () => number
  },
): TargetWord[] {
  const random = options.random ?? Math.random
  const excluded = new Set((options.excludeLemmas ?? []).map((l) => l.toLowerCase()))
  const pool = new Map<string, VocabRecord>()
  for (const record of records) {
    const lemma = record.lemma.toLowerCase()
    if (lemma.length < 3) continue
    if (isFunctionWord(lemma)) continue
    if (excluded.has(lemma)) continue
    if (pool.has(lemma)) continue
    pool.set(lemma, record)
  }

  const candidates: TargetWord[] = [...pool.values()].map((record) => {
    const entry = getEcdictEntry(record.lemma)
    const gloss = splitSenses(entry?.translation)[0]?.replace(/^[a-z]+\.\s*/i, '') ?? ''
    return {
      lemma: record.lemma,
      spelling: record.spelling,
      gloss: gloss.slice(0, 42),
      weight: targetWeight(record),
    }
  })

  const picked: TargetWord[] = []
  const remaining = [...candidates]
  while (picked.length < options.count && remaining.length > 0) {
    const total = remaining.reduce((sum, item) => sum + Math.max(0.0001, item.weight), 0)
    let ticket = random() * total
    let index = remaining.length - 1
    for (let i = 0; i < remaining.length; i += 1) {
      ticket -= Math.max(0.0001, remaining[i].weight)
      if (ticket <= 0) {
        index = i
        break
      }
    }
    picked.push(remaining[index])
    remaining.splice(index, 1)
  }
  return picked
}

/**
 * 从难度带内挑一批「用户词库之外、Oxford 之外」的候选新词给 LLM 做提示。
 * 这不是把词典塞进 Prompt，而是给模型一个可控的新词调色板，
 * 避免它整篇只用基础词，导致确定性校验的「生词数 ≥ 目标 - 3」永远不达标。
 */
const SENSITIVE_OR_PROPER = new Set([
  'american',
  'british',
  'african',
  'chinese',
  'christmas',
  'european',
  'christian',
  'catholic',
  'french',
  'indian',
  'russian',
  'japanese',
  'german',
  'english',
  'jewish',
  'muslim',
  'islamic',
  'soviet',
  'republican',
  'democratic',
  'socialist',
  'republic',
  'bible',
  'jesus',
  'god',
  'war',
  'warfare',
  'invasion',
  'raid',
  'weapon',
  'gun',
  'rifle',
  'bomb',
])

export function selectNewWordCandidates(options: {
  level: Level
  count: number
  excludeLemmas?: string[]
  vocabLemmas?: Set<string>
  random?: () => number
}): TargetWord[] {
  const vocab = options.vocabLemmas ?? new Set<string>()
  const excluded = new Set((options.excludeLemmas ?? []).map((word) => word.toLowerCase()))
  const random = options.random ?? Math.random
  const rows = getRawDb()
    .prepare(
      `SELECT word, translation FROM ecdict
       WHERE oxford = 0 AND frq > 0
         AND length(word) BETWEEN 4 AND 12
         AND word GLOB '[a-z]*' AND word NOT GLOB '*[^a-z]*'
       ORDER BY frq ASC
       LIMIT 8000`,
    )
    .all() as { word: string; translation: string | null }[]

  const pool: TargetWord[] = []
  for (const row of rows) {
    const word = row.word.toLowerCase()
    if (excluded.has(word) || vocab.has(word)) continue
    if (SENSITIVE_OR_PROPER.has(word)) continue
    if (!row.translation) continue
    if (!inBand(word, options.level)) continue
    if (isFunctionWord(word) || isProperNounWord(word)) continue
    const variants = [word, ...spellingVariants(word)]
    if (variants.some((variant) => getOxfordLevel(variant))) continue
    const entry = getEcdictEntry(word)
    if ((entry?.oxford ?? 0) > 0) continue
    const lemma = resolveLemma(word)
    // 只把原形放进候选，避免让模型刻意使用 abandoned / studies 这类屈折形。
    if (lemma !== word) continue
    if (vocab.has(lemma) || getOxfordLevel(lemma)) continue
    const gloss = splitSenses(row.translation)[0]?.replace(/^[a-z]+\.\s*/i, '') ?? ''
    pool.push({ lemma: word, spelling: word, gloss: gloss.slice(0, 36), weight: 1 })
    if (pool.length >= 800) break
  }

  // 在词频较高的一段里随机抽取，避免总是同一批词。
  const shortlist = pool.slice(0, Math.min(pool.length, Math.max(options.count * 12, 120)))
  for (let i = shortlist.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[shortlist[i], shortlist[j]] = [shortlist[j], shortlist[i]]
  }
  return shortlist.slice(0, options.count)
}

export function recentTopicList(
  rows: { topic: string; requestJson: string | null }[],
  limit = 5,
): string[] {
  const topics: string[] = []
  for (const row of rows.slice(0, limit)) {
    let topic = row.topic
    if (row.requestJson) {
      try {
        const parsed = JSON.parse(row.requestJson) as { topic?: string }
        if (parsed.topic) topic = parsed.topic
      } catch {
        // ignore
      }
    }
    if (topic) topics.push(topic.toLowerCase())
  }
  return topics
}

export function recentTargetLemmas(rows: { requestJson: string | null }[], limit = 3): string[] {
  const words: string[] = []
  for (const row of rows.slice(0, limit)) {
    if (!row.requestJson) continue
    try {
      const parsed = JSON.parse(row.requestJson) as { targets?: string[] }
      if (Array.isArray(parsed.targets)) words.push(...parsed.targets.map((w) => w.toLowerCase()))
    } catch {
      // ignore
    }
  }
  return [...new Set(words)]
}

export function pickTopic(recent: string[], random: () => number = Math.random): string {
  const recentSet = new Set(recent)
  const available = TOPIC_POOL.filter((topic) => !recentSet.has(topic.toLowerCase()))
  const pool = available.length ? available : TOPIC_POOL
  return pool[Math.floor(random() * pool.length)]
}

export function pickGenre(random: () => number = Math.random): Genre {
  return GENRES[Math.floor(random() * GENRES.length)]
}

export function genrePrompt(genre: Genre): string {
  return GENRE_META[genre].prompt
}

export interface LevelGuidance {
  label: string
  tags: string
  cefr: string
  sentence: string
}

export const LEVEL_GUIDANCE: Record<Level, LevelGuidance> = {
  gaokao: {
    label: '高考',
    tags: 'zk/gk',
    cefr: 'A2–B1',
    sentence: 'Use clear high-school English. Sentences averaging 15–20 words.',
  },
  cet4: {
    label: '四级',
    tags: 'cet4',
    cefr: 'B1–B2',
    sentence: 'Use natural college English. Sentences averaging 17–22 words.',
  },
  cet6: {
    label: '六级',
    tags: 'cet6',
    cefr: 'B2',
    sentence: 'Use upper-intermediate English with some complex structures.',
  },
  ielts: {
    label: '雅思',
    tags: 'ielts',
    cefr: 'B2–C1',
    sentence: 'Use IELTS-style general reading English with varied structures.',
  },
  ky: {
    label: '考研',
    tags: 'ky',
    cefr: 'B2–C1',
    sentence: 'Use exam-oriented argumentative English, still plain and concrete.',
  },
  toefl: {
    label: '托福',
    tags: 'toefl',
    cefr: 'B2–C1',
    sentence: 'Use academic-flavoured explanatory English with concrete examples.',
  },
}

export function inBand(word: string, level: Level): boolean {
  const entry = getEcdictEntry(word)
  if (!entry) return false
  const tags = new Set(LEVEL_GUIDANCE[level].tags.split('/'))
  return getEntryTags(entry).some((tag) => tags.has(tag))
}
