import { jsonError, jsonOk } from '@/lib/api'
import { getPersonalContent } from '@/lib/words/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ lemma: string }> },
) {
  try {
    const { lemma } = await context.params
    const personal = await getPersonalContent(decodeURIComponent(lemma).trim().toLowerCase())
    return jsonOk({ personal })
  } catch (error) {
    return jsonError(error)
  }
}
