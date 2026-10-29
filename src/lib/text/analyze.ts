import { createClassifyDeps } from '@/lib/analysis/context'
import type { Level, OxfordMode } from '@/lib/constants'
import { MAX_IMPORT_CHARS } from '@/lib/constants'
import { AppError } from '@/lib/errors'
import type { ArticleMetrics, SentenceRecord, TokenRecord } from '@/lib/types'
import type { ClassifyDeps } from '@/lib/text/classify'
import { classifyWord } from '@/lib/text/classify'
import { segmentSentences, tokenizeSentence } from '@/lib/text/segment'

export interface AnalyzeOptions {
  level: Level
  oxfordMode?: OxfordMode
  targets?: string[]
  maxChars?: number
  deps?: ClassifyDeps
}

export interface AnalysisResult {
  text: string
  sentences: SentenceRecord[]
  tokens: TokenRecord[]
  metrics: ArticleMetrics
  paragraphCount: number
}

function classifyAndPush(
  raw: { start: number; end: number; surface: string },
  params: {
    sentence: SentenceRecord
    sentenceInitial: boolean
    deps: ClassifyDeps
    seen: Set<string>
  },
  tokens: TokenRecord[],
  counts: number[],
): void {
  const { sentence, sentenceInitial, deps, seen } = params
  const result = classifyWord({ surface: raw.surface, sentenceInitial }, deps)
  if (result.status === 'ignored') return
  const repeat = seen.has(result.lemma)
  seen.add(result.lemma)
  tokens.push({
    idx: tokens.length,
    start: sentence.start + raw.start,
    end: sentence.start + raw.end,
    surface: raw.surface,
    normalized: result.normalized,
    lemma: result.lemma,
    status: result.status,
    sentenceIndex: sentence.index,
    paragraph: sentence.p,
    knownResponse: result.knownResponse,
    repeat,
  })
  counts[sentence.index] = (counts[sentence.index] ?? 0) + 1
}

export function analyzeText(rawText: string, options: AnalyzeOptions): AnalysisResult {
  const limit = options.maxChars ?? MAX_IMPORT_CHARS
  if (rawText.length > limit * 2) {
    throw new AppError('TEXT_TOO_LONG', `文本过长，上限 ${limit.toLocaleString('en-US')} 字符`, 413)
  }
  const { text, sentences, paragraphCount } = segmentSentences(rawText)
  if (!text || sentences.length === 0) {
    throw new AppError('BAD_REQUEST', '没有可分析的英文文本', 400)
  }
  if (text.length > limit) {
    throw new AppError('TEXT_TOO_LONG', `文本过长，上限 ${limit.toLocaleString('en-US')} 字符`, 413)
  }

  const deps = options.deps ?? createClassifyDeps(options.level, options.oxfordMode)
  const targets = (options.targets ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)
  const tokens: TokenRecord[] = []
  const seen = new Set<string>()
  const counts: number[] = new Array(sentences.length).fill(0)

  for (const sentence of sentences) {
    const raws = tokenizeSentence(sentence.text)
    if (raws.length === 0) continue
    const firstStart = raws[0].start

    for (const raw of raws) {
      const sentenceInitial = raw.start === firstStart

      if (!raw.parts) {
        classifyAndPush(raw, { sentence, sentenceInitial, deps, seen }, tokens, counts)
        continue
      }

      const whole = classifyWord({ surface: raw.surface, sentenceInitial }, deps)
      const wholeCandidates = deps.lemmaCandidates(raw.surface)
      const wholeHasEntry = wholeCandidates.some((candidate) => Boolean(deps.getEntry(candidate)))
      const keepWhole =
        wholeHasEntry ||
        whole.status === 'proper' ||
        whole.status === 'basic' ||
        whole.status === 'known' ||
        whole.status === 'new'

      if (keepWhole) {
        classifyAndPush(
          { start: raw.start, end: raw.end, surface: raw.surface },
          { sentence, sentenceInitial, deps, seen },
          tokens,
          counts,
        )
        continue
      }

      raw.parts.forEach((part, partIndex) => {
        classifyAndPush(
          part,
          {
            sentence,
            sentenceInitial: sentenceInitial && partIndex === 0,
            deps,
            seen,
          },
          tokens,
          counts,
        )
      })
    }
  }

  const metrics = computeMetrics({
    tokens,
    sentences,
    paragraphCount,
    targets,
    sentenceWordCounts: counts,
  })

  return { text, sentences, tokens, metrics, paragraphCount }
}

export function computeMetrics(params: {
  tokens: TokenRecord[]
  sentences: SentenceRecord[]
  paragraphCount: number
  targets: string[]
  sentenceWordCounts: number[]
}): ArticleMetrics {
  const { tokens, sentences, paragraphCount, targets, sentenceWordCounts } = params
  const wordCount = tokens.length
  const newLemmas: string[] = []
  const outOfBandLemmas: string[] = []
  const newSet = new Set<string>()
  const outSet = new Set<string>()
  let basicCount = 0
  let knownCount = 0
  let properCount = 0
  let newTokenCount = 0
  let outOfBandTokenCount = 0

  for (const token of tokens) {
    if (token.status === 'basic') basicCount += 1
    else if (token.status === 'known') knownCount += 1
    else if (token.status === 'proper') properCount += 1
    else if (token.status === 'new') {
      newTokenCount += 1
      if (!newSet.has(token.lemma)) {
        newSet.add(token.lemma)
        newLemmas.push(token.lemma)
      }
    } else if (token.status === 'out_of_band') {
      outOfBandTokenCount += 1
      if (!outSet.has(token.lemma)) {
        outSet.add(token.lemma)
        outOfBandLemmas.push(token.lemma)
      }
    }
  }

  const targetUsed: string[] = []
  if (targets.length) {
    const forms = new Set<string>()
    for (const token of tokens) {
      forms.add(token.lemma)
      forms.add(token.normalized)
      forms.add(token.surface.toLowerCase())
    }
    for (const target of targets) {
      if (forms.has(target)) targetUsed.push(target)
    }
  }

  const sentenceCount = sentences.length
  const safeWordCount = Math.max(1, wordCount)
  const maxSentenceLength = sentenceWordCounts.reduce((max, n) => Math.max(max, n), 0)
  const avgSentenceLength = sentenceCount ? Math.round((wordCount / sentenceCount) * 10) / 10 : 0
  const readingMinutes = Math.max(0.5, Math.round((wordCount / 200) * 2) / 2)

  return {
    wordCount,
    sentenceCount,
    paragraphCount,
    avgSentenceLength,
    maxSentenceLength,
    basicCount,
    knownCount,
    newCount: newLemmas.length,
    outOfBandCount: outOfBandLemmas.length,
    properCount,
    newTokenCount,
    outOfBandTokenCount,
    newDensity: wordCount ? newTokenCount / safeWordCount : 0,
    outOfBandDensity: wordCount ? outOfBandTokenCount / safeWordCount : 0,
    basicCoverage: wordCount ? basicCount / safeWordCount : 0,
    targetCount: targets.length,
    targetUsed,
    targetCoverage: targets.length ? targetUsed.length / targets.length : 0,
    estimatedReadingMinutes: readingMinutes,
    newLemmas,
    outOfBandLemmas,
    sentenceWordCounts,
  }
}
