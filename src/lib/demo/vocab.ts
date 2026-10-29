import fs from 'node:fs'
import path from 'node:path'
import { getDataDir } from '@/lib/env'
import { getRawDb } from '@/lib/db'
import { getVocabCount, replaceVocab, type VocabUpsertInput } from '@/lib/db/queries'
import { getOxfordLevel, isFunctionWord, isProperNounWord } from '@/lib/dict/basic'
import { resolveLemma } from '@/lib/dict/lemma'

const DEMO_VOCAB_FILE = 'demo/vocab.json'

interface DemoWordRow {
  word: string
  translation: string | null
}

function demoVocabPath(): string {
  return path.join(getDataDir(), DEMO_VOCAB_FILE)
}

function dateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

export function buildDemoVocab(limit = 300): VocabUpsertInput[] {
  const rows = getRawDb()
    .prepare(
      `SELECT word, translation FROM ecdict
       WHERE oxford = 0
         AND frq > 0
         AND (tag LIKE '%gk%' OR tag LIKE '%cet4%' OR tag LIKE '%cet6%')
         AND length(word) BETWEEN 4 AND 11
         AND word GLOB '[a-z]*'
         AND word NOT GLOB '*[^a-z]*'
       ORDER BY frq ASC
       LIMIT 8000`,
    )
    .all() as DemoWordRow[]

  // 国名/民族/宗教形容词不适合做目标词；虽然 ECDICT 里是小写，也排除。
  const notTargets = new Set([
    'american',
    'british',
    'african',
    'chinese',
    'christmas',
    'european',
    'christian',
    'french',
    'indian',
    'russian',
    'japanese',
    'german',
    'english',
    'catholic',
    'jewish',
    'soviet',
    'republican',
    'democratic',
    'canadian',
    'australian',
    'italian',
    'spanish',
    'dutch',
    'greek',
    'irish',
    'scottish',
    'welsh',
    'mexican',
    'brazilian',
    'korean',
    'vietnamese',
    'thai',
    'arab',
    'islamic',
    'muslim',
    'jesus',
    'god',
    'bible',
    'quran',
  ])
  const filtered = rows.filter(
    (row) =>
      row.translation &&
      !notTargets.has(row.word) &&
      !isFunctionWord(row.word) &&
      !isProperNounWord(row.word) &&
      !getOxfordLevel(row.word),
  )
  if (filtered.length === 0) return []
  // 取词频最高的一段，再均匀抽样，避免 Demo 目标词过于生僻。
  const pool = filtered.slice(0, Math.max(limit, Math.min(filtered.length, 1500)))
  const step = Math.max(1, Math.floor(pool.length / limit))
  const picked: VocabUpsertInput[] = []
  for (let i = 0; i < pool.length && picked.length < limit; i += step) {
    const row = pool[i]
    const index = picked.length
    const lemma = resolveLemma(row.word)
    const responseRoll = index % 100
    let lastResponse = 'FAMILIAR'
    if (responseRoll < 3) lastResponse = 'FORGET'
    else if (responseRoll < 8) lastResponse = 'VAGUE'
    else if (responseRoll < 26) lastResponse = 'WELL_FAMILIAR'
    else if (responseRoll < 34) lastResponse = 'STUDY_RESPONSE_UNSPECIFIED'
    const tags = index % 17 === 0 ? ['STICKING'] : index % 29 === 0 ? ['WELL_FAMILIAR'] : []
    picked.push({
      vocId: `demo-${String(index + 1).padStart(4, '0')}`,
      spelling: row.word,
      lemma,
      lastResponse,
      studyCount: (index * 7) % 42,
      tags,
      addDate: dateDaysAgo(30 + ((index * 13) % 500)),
      firstStudyDate: dateDaysAgo(10 + ((index * 5) % 300)),
      lastStudyDate: dateDaysAgo((index * 3) % 120),
      nextStudyDate: dateDaysAgo(-((index * 2) % 30)),
      source: 'demo',
    })
  }
  return picked
}

export function loadBundledDemoVocab(): VocabUpsertInput[] | null {
  const file = demoVocabPath()
  if (!fs.existsSync(file)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as VocabUpsertInput[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeBundledDemoVocab(records: VocabUpsertInput[]): void {
  const file = demoVocabPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(records, null, 2), 'utf8')
}

export function ensureDemoVocab(): number {
  const count = getVocabCount()
  if (count > 0) return count
  const bundled = loadBundledDemoVocab()
  const records = bundled && bundled.length > 0 ? bundled : buildDemoVocab(300)
  if (records.length === 0) return 0
  replaceVocab(records, 'demo')
  if (!bundled) writeBundledDemoVocab(records)
  return records.length
}

export function seedDemoVocab(force = false): number {
  if (!force) return ensureDemoVocab()
  const records = buildDemoVocab(300)
  if (records.length === 0) return 0
  replaceVocab(records, 'demo')
  writeBundledDemoVocab(records)
  return records.length
}
