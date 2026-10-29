import { isDemoMode, getMaimemoToken } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { refreshArticleAnalysis } from '@/lib/articles/service'
import {
  getAddition,
  getArticleRow,
  getTokens,
  getVocabMap,
  getWordLookup,
  listAdditions,
  putWordLookup,
  upsertAddition,
  upsertVocab,
  type AdditionRecord,
} from '@/lib/db/queries'
import { getEcdictEntry, getEntryTags, getFrequency, parseExchange } from '@/lib/dict/ecdict'
import { lemmaCandidates, resolveLemma } from '@/lib/dict/lemma'
import { createClassifyDeps } from '@/lib/analysis/context'
import { getDefaultLevel } from '@/lib/settings'
import { getLlmConfig } from '@/lib/env'
import { generateStructured } from '@/lib/llm/client'
import { wordExamplesSchema, type WordExamplesObject } from '@/lib/generation/schema'
import { buildExamplesMessages } from '@/lib/generation/prompts'
import { MaimemoClient } from '@/lib/maimemo/client'
import { classifyWord } from '@/lib/text/classify'
import { shortHash } from '@/lib/hash'
import type { ArticleContent, TokenRecord, WordCardData } from '@/lib/types'

export interface WordCardParams {
  lemma: string
  surface?: string
  articleId?: string
  sentenceIndex?: number
}

function safeContent(raw: string): ArticleContent | null {
  try {
    return JSON.parse(raw) as ArticleContent
  } catch {
    return null
  }
}

function pickEntry(lemma: string, surface: string | undefined) {
  const candidates = [...lemmaCandidates(surface || lemma), lemma, surface || ''].filter(Boolean)
  for (const candidate of candidates) {
    const entry = getEcdictEntry(candidate)
    if (entry) return { entry, lemma: candidate }
  }
  return { entry: null, lemma }
}

function pickVocab(lemma: string, surface: string | undefined) {
  const vocab = getVocabMap()
  const candidates = [...lemmaCandidates(surface || lemma), lemma, resolveLemma(surface || lemma)]
  for (const candidate of candidates) {
    const record = vocab.get(candidate)
    if (record) return record
  }
  return null
}

function findToken(tokens: TokenRecord[], lemma: string, surface?: string): TokenRecord | null {
  return (
    tokens.find((token) => token.lemma === lemma) ??
    (surface
      ? tokens.find((token) => token.surface.toLowerCase() === surface.toLowerCase())
      : null) ??
    null
  )
}

function parseDetailExample(
  detail: string | null,
): { text: string; translation?: string; ai: boolean } | null {
  if (!detail) return null
  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>
    const raw = parsed.sentence ?? parsed.example ?? parsed.examples
    if (typeof raw === 'string' && raw.trim()) return { text: raw.trim(), ai: false }
    if (Array.isArray(raw) && raw.length > 0) {
      const first = raw[0]
      if (typeof first === 'string') return { text: first, ai: false }
      const value = first as Record<string, unknown>
      const text = value.text ?? value.sentence ?? value.en
      if (typeof text === 'string') {
        const translation = value.translation ?? value.zh
        return {
          text,
          translation: typeof translation === 'string' ? translation : undefined,
          ai: false,
        }
      }
    }
  } catch {
    // ignore
  }
  return null
}

export function getWordCard(params: WordCardParams): WordCardData {
  const lemma = params.lemma.trim().toLowerCase()
  const surface = params.surface?.trim()
  const article = params.articleId ? getArticleRow(params.articleId) : null
  const content = article ? safeContent(article.contentJson) : null
  const tokens = article ? getTokens(article.id) : []
  const token = findToken(tokens, lemma, surface)

  let status: WordCardData['status'] = token?.status ?? 'out_of_band'
  let knownResponse = token?.knownResponse ?? null
  let sentenceIndex = token?.sentenceIndex ?? params.sentenceIndex ?? 0

  if (!token && article) {
    const deps = createClassifyDeps(article.level as Parameters<typeof createClassifyDeps>[0])
    const result = classifyWord(
      { surface: surface || lemma, sentenceInitial: false },
      deps,
    )
    status = result.status
    knownResponse = result.knownResponse
  } else if (!token && !article) {
    const deps = createClassifyDeps(getDefaultLevel())
    const result = classifyWord({ surface: surface || lemma, sentenceInitial: false }, deps)
    status = result.status
    knownResponse = result.knownResponse
  }

  const picked = pickEntry(lemma, surface)
  const entry = picked.entry
  const vocabRecord = pickVocab(lemma, surface)
  const inVocab = Boolean(vocabRecord)
  if (inVocab && !knownResponse) knownResponse = vocabRecord?.lastResponse ?? null

  const addition = getAddition(lemma)
  const cachedExamples = getWordLookup<{ examples: WordExamplesObject['examples'] }>(
    `ai-examples:${lemma}`,
  )
  const originalSentence =
    content?.sentences?.[sentenceIndex]?.text ??
    (token ? content?.sentences?.[token.sentenceIndex]?.text : null) ??
    null

  return {
    lemma: picked.lemma,
    surface: surface || token?.surface || lemma,
    phonetic: entry?.phonetic ?? null,
    translation: entry?.translation ?? null,
    definition: entry?.definition ?? null,
    pos: entry?.pos ?? null,
    tags: getEntryTags(entry),
    oxford: (entry?.oxford ?? 0) > 0,
    collins: entry?.collins ?? null,
    frq: getFrequency(entry),
    forms: parseExchange(entry?.exchange),
    status,
    knownResponse,
    inVocab,
    inMaimemo: isDemoMode() ? null : inVocab,
    example: parseDetailExample(entry?.detail ?? null),
    aiExamples: cachedExamples?.payload.examples ?? [],
    originalSentence,
    personal: null,
    canAdd: !inVocab,
    additionStatus: inVocab
      ? 'synced'
      : addition?.status === 'synced' || addition?.status === 'failed' || addition?.status === 'pending'
        ? addition.status
        : 'none',
    demo: isDemoMode(),
  }
}

export async function getAiExamples(lemma: string, translation: string | null): Promise<{
  examples: { text: string; translation?: string }[]
  configured: boolean
  cached: boolean
}> {
  const cacheKey = `ai-examples:${lemma}`
  const cached = getWordLookup<{ examples: WordExamplesObject['examples'] }>(cacheKey)
  if (cached) {
    return { examples: cached.payload.examples, configured: true, cached: true }
  }
  if (!getLlmConfig().configured) {
    return { examples: [], configured: false, cached: false }
  }
  const messages = buildExamplesMessages(lemma, translation)
  const result = await generateStructured({
    schema: wordExamplesSchema,
    system: messages.system,
    prompt: messages.prompt,
    temperature: 0.7,
    maxOutputTokens: 600,
    label: 'word-examples',
  })
  putWordLookup(cacheKey, { examples: result.examples })
  return { examples: result.examples, configured: true, cached: false }
}

const personalCache = new Map<string, { data: WordCardData['personal']; at: number }>()

export async function getPersonalContent(lemma: string): Promise<WordCardData['personal']> {
  if (!getMaimemoToken() || isDemoMode()) return null
  const record = pickVocab(lemma, lemma)
  if (!record || record.source === 'demo') return null
  const cached = personalCache.get(record.vocId)
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data
  const client = new MaimemoClient()
  const data = await client.getPersonalContent(record.vocId)
  personalCache.set(record.vocId, { data, at: Date.now() })
  return data
}

export interface AddWordResult {
  added: boolean
  addedCount: number
  already: boolean
  simulated: boolean
  message: string
  vocabId: string | null
}

export async function addWord(params: {
  lemma: string
  spelling: string
  articleId?: string
}): Promise<AddWordResult> {
  const lemma = params.lemma.trim().toLowerCase()
  const spelling = params.spelling.trim() || lemma
  const existing = pickVocab(lemma, spelling)
  if (existing) {
    return {
      added: false,
      addedCount: 0,
      already: true,
      simulated: existing.source === 'demo',
      message: '该词已在学习计划中，无需重复添加。',
      vocabId: existing.vocId,
    }
  }
  const previous = getAddition(lemma)
  if (previous?.status === 'synced') {
    return {
      added: false,
      addedCount: 0,
      already: true,
      simulated: previous.simulated,
      message: previous.simulated
        ? 'Demo 模式：该词已模拟加入。'
        : '上次已处理该词（added_count=0，可能已在计划或达到上限）。',
      vocabId: previous.vocId,
    }
  }

  const demo = isDemoMode()
  if (demo) {
    const vocId = `demo-add-${shortHash(lemma)}`
    upsertVocab({
      vocId,
      spelling,
      lemma,
      lastResponse: 'STUDY_RESPONSE_UNSPECIFIED',
      studyCount: 0,
      tags: [],
      source: 'demo',
    })
    upsertAddition({
      lemma,
      vocId,
      spelling,
      status: 'synced',
      simulated: true,
      error: null,
    })
    refreshQuietly(params.articleId)
    return {
      added: true,
      addedCount: 1,
      already: false,
      simulated: true,
      message: 'Demo 模式：已模拟加入（未写入墨墨）。配置 Token 后会真正写入。',
      vocabId: vocId,
    }
  }

  const client = new MaimemoClient()
  try {
    const words = await client.queryVocabulary([spelling])
    const match =
      words.find((word) => word.spelling.toLowerCase() === spelling.toLowerCase()) ?? words[0]
    if (!match) {
      throw new AppError(
        'MAIMEMO_ERROR',
        `墨墨词典中找不到 “${spelling}”，无法获取 voc_id。`,
        404,
      )
    }
    const addedCount = await client.addWords([match.id])
    if (addedCount > 0) {
      upsertVocab({
        vocId: match.id,
        spelling: match.spelling,
        lemma,
        lastResponse: 'STUDY_RESPONSE_UNSPECIFIED',
        studyCount: 0,
        tags: [],
        source: 'maimemo',
      })
    }
    upsertAddition({
      lemma,
      vocId: match.id,
      spelling: match.spelling,
      status: 'synced',
      simulated: false,
      error: null,
    })
    refreshQuietly(params.articleId)
    return {
      added: addedCount > 0,
      addedCount,
      already: addedCount === 0,
      simulated: false,
      message:
        addedCount > 0
          ? '已加入墨墨学习计划。重新分析后该词会显示为「已知」。'
          : '墨墨返回 added_count=0：该词可能已在学习计划中，或已到达单词上限。',
      vocabId: match.id,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '加入失败'
    upsertAddition({
      lemma,
      spelling,
      status: 'failed',
      simulated: false,
      error: message,
    })
    if (error instanceof AppError) throw error
    throw new AppError('MAIMEMO_ERROR', `加入墨墨失败：${message}`, 502)
  }
}

function refreshQuietly(articleId?: string): void {
  if (!articleId) return
  try {
    refreshArticleAnalysis(articleId)
  } catch (error) {
    console.warn('[words] refresh article failed', error)
  }
}

export function getAdditions(): AdditionRecord[] {
  return listAdditions()
}

export async function retryAdditions(lemma?: string): Promise<
  { lemma: string; ok: boolean; message: string }[]
> {
  const targets = listAdditions(200).filter(
    (item) => item.status === 'failed' && (!lemma || item.lemma === lemma),
  )
  const results: { lemma: string; ok: boolean; message: string }[] = []
  for (const item of targets) {
    try {
      const result = await addWord({ lemma: item.lemma, spelling: item.spelling })
      results.push({ lemma: item.lemma, ok: true, message: result.message })
    } catch (error) {
      results.push({
        lemma: item.lemma,
        ok: false,
        message: error instanceof Error ? error.message : '重试失败',
      })
    }
  }
  return results
}
