import { z } from 'zod'
import { LEVELS } from '@/lib/constants'
import { MAX_IMPORT_CHARS } from '@/lib/constants'
import { jsonError, jsonOk, readJson } from '@/lib/api'
import { persistArticle } from '@/lib/articles/service'
import { getDefaultVoice } from '@/lib/settings'
import { analyzeText } from '@/lib/text/analyze'
import { stripMarkdownNoise } from '@/lib/text/clean'
import type { ArticleRequest } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  text: z.string().min(1, '请输入文章内容').max(MAX_IMPORT_CHARS * 2, '文本过长'),
  title: z.string().max(120).optional(),
  level: z.enum(LEVELS),
})

function fallbackTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const words = cleaned.split(' ').slice(0, 8).join(' ')
  return words.replace(/^["'“”]+|["'“”]+$/g, '').replace(/[.,;:!?]+$/g, '') || 'Imported article'
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await readJson(request))
    const cleaned = stripMarkdownNoise(input.text)
    if (cleaned.length > MAX_IMPORT_CHARS) {
      return jsonOk(
        {
          error: {
            code: 'TEXT_TOO_LONG',
            message: `文本过长（${cleaned.length} 字符），上限 ${MAX_IMPORT_CHARS.toLocaleString('en-US')} 字符。`,
          },
        },
        413,
      )
    }
    const analysis = analyzeText(cleaned, {
      level: input.level,
      maxChars: MAX_IMPORT_CHARS,
    })
    const title = (input.title?.trim() || fallbackTitle(input.text)).slice(0, 120)
    const requestPayload: ArticleRequest = {
      level: input.level,
      length: analysis.metrics.wordCount,
      newWords: Math.max(10, Math.min(100, analysis.metrics.newCount)),
      topic: '用户导入',
      genre: 'expository',
      targets: [],
      supplement: '',
      voice: getDefaultVoice(),
      generatedWith: 'import',
      warnings: [],
    }
    const warnings: string[] = []
    if (analysis.metrics.newDensity > 0.08) {
      warnings.push(
        `生词密度 ${(analysis.metrics.newDensity * 100).toFixed(1)}%，这篇文章对你偏难。可以先看侧栏高频词。`,
      )
    }
    const articleId = persistArticle({
      title,
      kind: 'imported',
      level: input.level,
      topic: '用户导入',
      genre: 'expository',
      request: requestPayload,
      analysis,
      summaryZh: `导入文章 · ${analysis.metrics.wordCount} 词 · ${analysis.metrics.newCount} 个生词`,
    })
    return jsonOk({
      articleId,
      title,
      metrics: analysis.metrics,
      warnings,
    })
  } catch (error) {
    return jsonError(error)
  }
}
