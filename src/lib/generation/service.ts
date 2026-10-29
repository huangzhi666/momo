import type { Genre, Level, VoiceId } from '@/lib/constants'
import { DEFAULT_SETTINGS } from '@/lib/constants'
import { getLlmConfig } from '@/lib/env'
import { AppError } from '@/lib/errors'
import {
  getVocabRecords,
  insertArticle,
  listArticleRows,
  recentArticleRows,
} from '@/lib/db/queries'
import { persistArticle } from '@/lib/articles/service'
import { analyzeText } from '@/lib/text/analyze'
import { getTtsJobState } from '@/lib/tts/job'
import { startArticleTts } from '@/lib/tts/job'
import { getDefaultVoice } from '@/lib/settings'
import type { ArticleRequest } from '@/lib/types'
import { mulberry32 } from '@/lib/utils'
import { generateStructured } from '@/lib/llm/client'
import { buildGenerationMessages, buildRepairMessages } from './prompts'
import { generatedArticleSchema, type GeneratedArticleObject } from './schema'
import {
  maxNewWordsForLength,
  pickGenre,
  pickTopic,
  recentTargetLemmas,
  recentTopicList,
  selectTargets,
  type TargetWord,
} from './targets'
import { validateArticle, violationSummary, type ValidationResult } from './validate'
import { DEMO_ARTICLES } from '@/lib/demo/articles'
import { seedDemoContent } from '@/lib/demo/seed'

export interface GenerateArticleInput {
  level: Level
  length: number
  newWords: number
  topic?: string
  genre?: Genre | 'random'
  supplement?: string
  voice?: VoiceId
  seed?: number
}

export interface GenerateArticleResult {
  articleId: string
  demoFallback: boolean
  notice: string | null
  warnings: string[]
  metrics: ReturnType<typeof analyzeText>['metrics']
  validation: ValidationResult | null
  provider: string
}

function normalizeSentence(text: string): string {
  let value = text.replace(/\s+/g, ' ').trim()
  if (!value) return value
  if (!/[.!?…"'”’]$/.test(value)) value += '.'
  return value
}

export function buildArticleText(sentences: { p: number; text: string }[]): string {
  const groups = new Map<number, string[]>()
  for (const sentence of sentences) {
    const p = Number.isFinite(sentence.p) ? Math.max(1, Math.trunc(sentence.p)) : 1
    const text = normalizeSentence(sentence.text)
    if (!text) continue
    const list = groups.get(p) ?? []
    list.push(text)
    groups.set(p, list)
  }
  return [...groups.values()]
    .map((list) => list.join(' '))
    .filter(Boolean)
    .join('\n\n')
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s+/g, ' ')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/[.。]+$/g, '')
    .trim()
}

function riskySupplement(supplement: string): boolean {
  return /暴力|色情|政治|宗教|脏话|自杀|血腥|sex|violence|politics|religion|suicide/i.test(supplement)
}

async function createDemoFallback(
  input: GenerateArticleInput,
  warnings: string[],
): Promise<GenerateArticleResult> {
  let rows = listArticleRows(50, 'demo')
  if (rows.length === 0) {
    await seedDemoContent({ audio: false })
    rows = listArticleRows(50, 'demo')
  }
  if (rows.length === 0) {
    throw new AppError(
      'CONFIG',
      '未配置 LLM_API_KEY，且 Demo 文章不可用。请配置 LLM 后重试。',
      400,
    )
  }
  const exact = rows.find((row) => row.level === input.level)
  const row = exact ?? rows[0]
  const demo = DEMO_ARTICLES.find((item) => item.title === row.title)
  const content = JSON.parse(row.contentJson) as {
    text: string
    summaryZh: string
    targets: string[]
  }
  const targets = content.targets ?? []
  const analysis = analyzeText(content.text, { level: input.level, targets })
  const voice = input.voice || getDefaultVoice()
  const request: ArticleRequest = {
    level: input.level,
    length: analysis.metrics.wordCount,
    newWords: input.newWords,
    topic: demo?.topic ?? row.topic,
    genre: (demo?.genre ?? row.genre) as Genre,
    targets,
    supplement: input.supplement ?? '',
    voice,
    generatedWith: 'demo-fallback',
    warnings: [
      ...warnings,
      '未配置 LLM：返回预置 Demo 文章，难度 / 篇幅 / 目标词参数未生效。',
    ],
  }
  const articleId = persistArticle({
    title: row.title,
    kind: 'demo',
    level: input.level,
    topic: request.topic,
    genre: request.genre,
    request,
    analysis,
    summaryZh: demo?.summaryZh ?? content.summaryZh,
    demo: true,
  })
  startArticleTts(articleId, voice)
  return {
    articleId,
    demoFallback: true,
    notice: '未配置 LLM_API_KEY：已载入预置 Demo 文章。配置后可生成任意难度与主题。',
    warnings: request.warnings ?? [],
    metrics: analysis.metrics,
    validation: null,
    provider: 'demo',
  }
}

export async function generateArticle(input: GenerateArticleInput): Promise<GenerateArticleResult> {
  const warnings: string[] = []
  const length = input.length
  const maxNew = maxNewWordsForLength(length)
  let newWords = Math.round(input.newWords)
  if (!Number.isFinite(newWords)) newWords = DEFAULT_SETTINGS.newWords
  if (newWords < 10) {
    newWords = 10
    warnings.push('新词数量下限为 10，已调整。')
  }
  if (newWords > maxNew) {
    warnings.push(`当前篇幅最多约 ${maxNew} 个生词（12% 密度上限），已限制为 ${maxNew}。`)
    newWords = maxNew
  }
  if (newWords > 100) newWords = 100

  const supplement = (input.supplement ?? '').slice(0, 300)
  if (riskySupplement(supplement)) {
    warnings.push('部分要求未采纳：补充要求与内容硬约束冲突，已以硬约束为准。')
  }

  const llm = getLlmConfig()
  if (!llm.configured) {
    return createDemoFallback({ ...input, newWords }, warnings)
  }

  let vocab = getVocabRecords()
  if (vocab.length === 0) {
    await seedDemoContent({ audio: false })
    vocab = getVocabRecords()
  }
  if (vocab.length === 0) {
    throw new AppError(
      'CONFIG',
      '本地词库为空。请先在设置页同步墨墨词库，或运行 pnpm db:seed 载入 Demo 词库。',
      400,
    )
  }

  const random = mulberry32(input.seed ?? Math.floor(Math.random() * 0xffffffff))
  const recentForTargets = recentArticleRows(3)
  const excludeTargets = recentTargetLemmas(
    recentForTargets.map((row) => ({ requestJson: row.requestJson })),
  )
  const targets = selectTargets(vocab, {
    count: newWords,
    excludeLemmas: excludeTargets,
    random,
  })
  if (targets.length < newWords) {
    warnings.push(`词库可用目标词不足，本次使用 ${targets.length} 个。`)
  }

  const recentTopics = recentTopicList(
    recentArticleRows(5).map((row) => ({ topic: row.topic, requestJson: row.requestJson })),
  )
  const manualTopic = input.topic?.trim()
  const topic = manualTopic || pickTopic(recentTopics, random)
  const genre = input.genre && input.genre !== 'random' ? input.genre : pickGenre(random)
  const voice = input.voice || getDefaultVoice()

  const messages = buildGenerationMessages({
    level: input.level,
    length,
    newTarget: newWords,
    topic,
    genre,
    targets,
    supplement,
  })

  let best: {
    object: GeneratedArticleObject
    analysis: ReturnType<typeof analyzeText>
    validation: ValidationResult
    score: number
  } | null = null

  for (let round = 0; round <= 2; round += 1) {
    const object: GeneratedArticleObject =
      round === 0 || !best
        ? await generateStructured({
            schema: generatedArticleSchema,
            system: messages.system,
            prompt: messages.prompt,
            temperature: round === 0 ? 0.9 : 0.75,
            label: `generate-r${round}`,
          })
        : await generateStructured({
            schema: generatedArticleSchema,
            system: buildRepairMessages({
              originalSystem: messages.system,
              previous: best.object,
              violations: violationSummary(best.validation),
              missingTargets: best.validation.repairFocus.missingTargets,
              newLemmas: best.validation.repairFocus.newLemmas,
              outOfBandLemmas: best.validation.repairFocus.outOfBandLemmas,
            }).system,
            prompt: buildRepairMessages({
              originalSystem: messages.system,
              previous: best.object,
              violations: violationSummary(best.validation),
              missingTargets: best.validation.repairFocus.missingTargets,
              newLemmas: best.validation.repairFocus.newLemmas,
              outOfBandLemmas: best.validation.repairFocus.outOfBandLemmas,
            }).prompt,
            temperature: 0.75,
            label: `repair-r${round}`,
          })

    const text = buildArticleText(object.sentences)
    const analysis = analyzeText(text, {
      level: input.level,
      targets: targets.map((target) => target.lemma),
    })
    const validation = validateArticle({
      title: cleanTitle(object.title),
      text,
      metrics: analysis.metrics,
      length,
      newTarget: newWords,
      targets: targets.map((target) => target.lemma),
    })
    const score = validation.blocking.length
    if (!best || score < best.score) {
      best = { object, analysis, validation, score }
    }
    if (validation.acceptable) break
  }

  if (!best) {
    throw new AppError('GENERATION_FAILED', '生成失败：没有得到可用文章，请重试。', 502)
  }

  if (best.validation.blocking.length > 0) {
    warnings.push(
      `连续 3 次未完全达标，已接受当前版本：${best.validation.blocking
        .map((check) => `${check.label} ${check.actual}`)
        .join('，')}`,
    )
  }

  const title = cleanTitle(best.object.title)
  const actualGenre = input.genre && input.genre !== 'random' ? input.genre : best.object.genre
  const request: ArticleRequest = {
    level: input.level,
    length,
    newWords,
    topic,
    genre: actualGenre,
    targets: targets.map((target) => target.lemma),
    supplement,
    voice,
    seed: input.seed,
    model: llm.model,
    generatedWith: 'llm',
    warnings,
  }

  const articleId = persistArticle({
    title,
    kind: 'generated',
    level: input.level,
    topic,
    genre: actualGenre,
    request,
    analysis: best.analysis,
    summaryZh: best.object.summary_zh,
  })
  startArticleTts(articleId, voice)

  return {
    articleId,
    demoFallback: false,
    notice: null,
    warnings,
    metrics: best.analysis.metrics,
    validation: best.validation,
    provider: 'llm',
  }
}

export function isDemoReady(): boolean {
  return listArticleRows(50, 'demo').length > 0
}

export function ttsStateFor(articleId: string, voice: string) {
  return getTtsJobState(articleId, voice)
}
