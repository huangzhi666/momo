import { LEVELS, type Level } from '@/lib/constants'
import { ensureDemoVocab } from '@/lib/demo/vocab'
import { isDemoMode } from '@/lib/env'
import { getVocabCount, getVocabRecords, recentArticleRows } from '@/lib/db/queries'
import { recentTargetLemmas, selectTargets } from '@/lib/generation/targets'
import { jsonError, jsonOk, queryInt } from '@/lib/api'
import { mulberry32 } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const levelParam = url.searchParams.get('level')
    const level = (LEVELS as readonly string[]).includes(levelParam ?? '')
      ? (levelParam as Level)
      : 'gaokao'
    const count = queryInt(url.searchParams.get('count'), 12, 1, 100)
    const seed = queryInt(url.searchParams.get('seed'), Math.floor(Math.random() * 0xffffffff), 1, 0xffffffff)

    if (getVocabCount() === 0 && isDemoMode()) {
      ensureDemoVocab()
    }

    const vocab = getVocabRecords()
    const recent = recentArticleRows(3).map((row) => ({ requestJson: row.requestJson }))
    const exclude = recentTargetLemmas(recent)
    const random = mulberry32(seed)
    const targets = selectTargets(vocab, { count, excludeLemmas: exclude, random })

    return jsonOk({
      seed,
      level,
      total: vocab.length,
      targets: targets.map((target) => ({
        lemma: target.lemma,
        spelling: target.spelling,
        gloss: target.gloss,
      })),
    })
  } catch (error) {
    return jsonError(error)
  }
}
