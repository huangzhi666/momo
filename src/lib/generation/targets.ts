import type { Genre, Level } from '@/lib/constants'
import { GENRE_META, GENRES, NEW_WORD_DENSITY_CAP, TOPIC_POOL } from '@/lib/constants'
import type { VocabRecord } from '@/lib/db/queries'
import { getEcdictEntry, getEntryTags } from '@/lib/dict/ecdict'
import { isFunctionWord } from '@/lib/dict/basic'
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
