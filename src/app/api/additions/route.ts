import { jsonError, jsonOk } from '@/lib/api'
import { getAdditions } from '@/lib/words/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return jsonOk({ additions: getAdditions() })
  } catch (error) {
    return jsonError(error)
  }
}
