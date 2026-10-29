import { AppError } from '@/lib/errors'
import { jsonError, jsonOk, queryInt } from '@/lib/api'
import { getWordCard } from '@/lib/words/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ lemma: string }> },
) {
  try {
    const { lemma } = await context.params
    const clean = decodeURIComponent(lemma).trim().toLowerCase()
    if (!clean || clean.length > 80) {
      throw new AppError('BAD_REQUEST', '词条不合法', 400)
    }
    const url = new URL(request.url)
    const surface = url.searchParams.get('surface') ?? undefined
    const articleId = url.searchParams.get('articleId') ?? undefined
    const sentenceIndex = queryInt(url.searchParams.get('sentence'), 0, 0, 10_000)
    return jsonOk(getWordCard({ lemma: clean, surface, articleId, sentenceIndex }))
  } catch (error) {
    return jsonError(error)
  }
}
