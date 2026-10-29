import { jsonError, jsonOk } from '@/lib/api'
import { listArticleSummaries } from '@/lib/articles/service'
import type { ArticleKind } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const kindParam = url.searchParams.get('kind')
    const kind =
      kindParam === 'generated' || kindParam === 'imported' || kindParam === 'demo'
        ? (kindParam as ArticleKind)
        : undefined
    return jsonOk({ articles: listArticleSummaries(100, kind) })
  } catch (error) {
    return jsonError(error)
  }
}
