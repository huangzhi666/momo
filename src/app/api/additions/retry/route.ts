import { z } from 'zod'
import { jsonError, jsonOk, readOptionalJson } from '@/lib/api'
import { retryAdditions } from '@/lib/words/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const schema = z.object({ lemma: z.string().max(80).optional() })

export async function POST(request: Request) {
  try {
    const body = schema.parse(await readOptionalJson(request))
    const results = await retryAdditions(body.lemma)
    return jsonOk({ results })
  } catch (error) {
    return jsonError(error)
  }
}
