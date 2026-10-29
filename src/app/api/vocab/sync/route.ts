import { AppError } from '@/lib/errors'
import { getMaimemoToken } from '@/lib/env'
import { getVocabSyncState, startVocabSync } from '@/lib/maimemo/sync'
import { jsonError, jsonOk, readOptionalJson } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return jsonOk(getVocabSyncState())
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    if (!getMaimemoToken()) {
      throw new AppError(
        'CONFIG',
        '未配置 MAIMEMO_API_TOKEN，无法同步墨墨词库。请先填写 .env.local 并重启服务。',
        400,
      )
    }
    const body = await readOptionalJson(request)
    const state = startVocabSync({ reset: Boolean(body.reset) })
    return jsonOk(state, 202)
  } catch (error) {
    return jsonError(error)
  }
}
