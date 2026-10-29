import { AppError } from '@/lib/errors'
import { isDemoMode } from '@/lib/env'
import { getVocabCount } from '@/lib/db/queries'
import { seedDemoContent } from '@/lib/demo/seed'
import { jsonError, jsonOk, readOptionalJson } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    if (!isDemoMode()) {
      throw new AppError('BAD_REQUEST', '当前不是 Demo 模式，无法重置 Demo 数据。', 400)
    }
    await readOptionalJson(request)
    const result = await seedDemoContent({
      audio: true,
      resetVocab: true,
      force: true,
    })
    return jsonOk({
      vocabCount: getVocabCount(),
      articleIds: result.articleIds,
      message: `Demo 词库已载入：${result.vocabCount} 个词，${result.articleIds.length} 篇文章。`,
    })
  } catch (error) {
    return jsonError(error)
  }
}
