import { VOICES } from '@/lib/constants'
import { jsonError, jsonOk, readOptionalJson } from '@/lib/api'
import { getArticleRow } from '@/lib/db/queries'
import { getTtsJobState, startArticleTts } from '@/lib/tts/job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function resolveVoice(value: unknown): string {
  if (typeof value === 'string' && VOICES.some((voice) => voice.id === value)) return value
  return 'female-us'
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    if (!getArticleRow(id)) return jsonOk({ error: { message: '文章不存在' } }, 404)
    const voice = resolveVoice(new URL(request.url).searchParams.get('voice'))
    return jsonOk(getTtsJobState(id, voice))
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    if (!getArticleRow(id)) return jsonOk({ error: { message: '文章不存在' } }, 404)
    const body = await readOptionalJson(request)
    const voice = resolveVoice(body.voice)
    return jsonOk(startArticleTts(id, voice), 202)
  } catch (error) {
    return jsonError(error)
  }
}
