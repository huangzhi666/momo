import { createOpenAI } from '@ai-sdk/openai'
import { NoObjectGeneratedError, generateObject, generateText } from 'ai'
import type { z } from 'zod'
import { AppError } from '@/lib/errors'
import { getLlmConfig } from '@/lib/env'

type FlexibleSchema<T> = z.ZodType<T>

function modelFor() {
  const config = getLlmConfig()
  if (!config.apiKey) {
    throw new AppError(
      'CONFIG',
      '未配置 LLM_API_KEY，无法生成。请在 .env.local 中配置，或使用 Demo 文章。',
      400,
    )
  }
  const openai = createOpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl })
  return { model: openai.chat(config.model), config }
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return candidate
  return candidate.slice(start, end + 1)
}

function shouldFallback(error: unknown): boolean {
  if (error instanceof NoObjectGeneratedError) return true
  const name = (error as { name?: string })?.name ?? ''
  const message = error instanceof Error ? error.message : String(error)
  if (name.includes('NoObject') || name.includes('JSON')) return true
  return /no object|json|parse|schema|response format/i.test(message)
}

export interface StructuredGenerationOptions<T> {
  schema: FlexibleSchema<T>
  system: string
  prompt: string
  temperature?: number
  maxOutputTokens?: number
  label?: string
}

/**
 * 推理型模型（如 deepseek-flash）会先消耗 reasoning tokens。
 * 早先 3000 的上限会让 320 词文章在 reasoning 阶段耗尽预算，最终 content 为空。
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 12_000

/**
 * 结构化生成。优先 generateObject（JSON mode，兼容 DeepSeek / OpenAI 兼容接口）；
 * 若供应商不支持 response_format，则退回 generateText + JSON 提取 + Zod 校验。
 */
export async function generateStructured<T>(
  options: StructuredGenerationOptions<T>,
): Promise<T> {
  const { model, config } = modelFor()
  const started = Date.now()
  const label = options.label ?? 'llm'

  try {
    const result = await generateObject({
      model,
      schema: options.schema,
      system: options.system,
      prompt: options.prompt,
      temperature: options.temperature ?? 0.85,
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(120_000),
      providerOptions: {
        openai: { structuredOutputs: false, strictJsonSchema: false },
      },
    })
    console.info(
      `[${label}] generateObject ok model=${config.model} ms=${Date.now() - started} tokens=${JSON.stringify(result.usage ?? {})}`,
    )
    return result.object as T
  } catch (error) {
    if (!shouldFallback(error)) {
      console.error(`[${label}] generateObject failed`, error)
      throw new AppError(
        'LLM_ERROR',
        `LLM 调用失败：${error instanceof Error ? error.message : '未知错误'}。请检查 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL。`,
        502,
      )
    }
    console.warn(`[${label}] generateObject parse fallback:`, error instanceof Error ? error.message : error)
  }

  try {
    const result = await generateText({
      model,
      system: `${options.system}\n\nIMPORTANT: Return only the JSON object. No prose, no Markdown fences.`,
      prompt: options.prompt,
      temperature: options.temperature ?? 0.85,
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(120_000),
    })
    const parsed = JSON.parse(extractJson(result.text)) as unknown
    const checked = options.schema.safeParse(parsed)
    if (!checked.success) {
      throw new AppError(
        'LLM_ERROR',
        `LLM 返回的 JSON 不符合结构：${checked.error.issues.map((i) => i.message).join('; ')}`,
        502,
      )
    }
    console.info(`[${label}] generateText fallback ok model=${config.model} ms=${Date.now() - started}`)
    return checked.data
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error(`[${label}] generateText fallback failed`, error)
    throw new AppError(
      'LLM_ERROR',
      `LLM 生成失败：${error instanceof Error ? error.message : '未知错误'}。请检查 API Key 与模型名，或稍后重试。`,
      502,
    )
  }
}
