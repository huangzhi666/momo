import { getEcdictEntry } from '@/lib/dict/ecdict'
import { splitSenses } from '@/lib/utils'
import { jsonError, jsonOk } from '@/lib/api'
import { getAiExamples } from '@/lib/words/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ lemma: string }> },
) {
  try {
    const { lemma } = await context.params
    const clean = decodeURIComponent(lemma).trim().toLowerCase()
    const entry = getEcdictEntry(clean)
    const translation = splitSenses(entry?.translation)[0] ?? null
    const result = await getAiExamples(clean, translation)
    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}
