import { z } from 'zod'
import { jsonError, jsonOk, readJson } from '@/lib/api'
import { addWord } from '@/lib/words/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  lemma: z.string().min(1).max(80),
  spelling: z.string().min(1).max(80),
  articleId: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  try {
    const input = schema.parse(await readJson(request))
    const result = await addWord(input)
    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}
