import { getAppStatus } from '@/lib/status'
import { jsonError, jsonOk } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return jsonOk(getAppStatus())
  } catch (error) {
    return jsonError(error)
  }
}
