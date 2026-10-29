import { jsonError, jsonOk } from '@/lib/api'
import { deleteArticle, getArticleDTO } from '@/lib/articles/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const voice = new URL(request.url).searchParams.get('voice') ?? undefined
    const article = getArticleDTO(id, voice)
    if (!article) return jsonOk({ error: { code: 'NOT_FOUND', message: '文章不存在' } }, 404)
    return jsonOk(article)
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    deleteArticle(id)
    return jsonOk({ ok: true })
  } catch (error) {
    return jsonError(error)
  }
}
