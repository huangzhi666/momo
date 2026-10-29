import { VOICES } from '@/lib/constants'
import { AppError } from '@/lib/errors'
import { jsonError, jsonOk } from '@/lib/api'
import { synthesizeWord } from '@/lib/tts/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const word = (url.searchParams.get('word') ?? '').trim()
    if (!word || word.length > 80) {
      throw new AppError('BAD_REQUEST', '单词不合法', 400)
    }
    const voiceParam = url.searchParams.get('voice') ?? 'female-us'
    const voice = VOICES.some((item) => item.id === voiceParam) ? voiceParam : 'female-us'
    const result = await synthesizeWord(word, voice)
    return jsonOk({
      url: `/api/audio/${result.hash}`,
      hash: result.hash,
      durationMs: result.durationMs,
      provider: result.provider,
      cacheHit: result.cacheHit,
    })
  } catch (error) {
    return jsonError(error)
  }
}
