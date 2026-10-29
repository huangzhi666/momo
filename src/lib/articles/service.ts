import { randomUUID } from 'node:crypto'
import { buildSummaryDTO } from './summary'
import type { Level, VoiceId } from '@/lib/constants'
import { getEcdictEntry, getFrequency } from '@/lib/dict/ecdict'
import {
  deleteArticleRow,
  getArticleAudio,
  getArticleRow,
  getTokens,
  insertArticle,
  insertTokens,
  listArticleRows,
  updateArticleContent,
  type ArticleAudioRow,
} from '@/lib/db/queries'
import { getDefaultVoice } from '@/lib/settings'
import { getTtsJobState } from '@/lib/tts/job'
import { getTtsProviderInfo } from '@/lib/tts/service'
import { analyzeText } from '@/lib/text/analyze'
import { splitSenses } from '@/lib/utils'
import { inBand } from '@/lib/generation/targets'
import type {
  ArticleAudioState,
  ArticleContent,
  ArticleKind,
  ArticleRequest,
  ArticleRowDTO,
  SentenceWithTokens,
  TokenRecord,
  WordMeta,
} from '@/lib/types'
import type { AnalysisResult } from '@/lib/text/analyze'

export function persistArticle(input: {
  title: string
  kind: ArticleKind
  level: Level
  topic: string
  genre: string
  request: ArticleRequest | null
  analysis: AnalysisResult
  summaryZh: string
  demo?: boolean
}): string {
  const id = randomUUID()
  const content: ArticleContent = {
    text: input.analysis.text,
    sentences: input.analysis.sentences,
    metrics: input.analysis.metrics,
    summaryZh: input.summaryZh,
    targets: input.request?.targets ?? [],
    demo: input.demo ?? false,
  }
  insertArticle({
    id,
    title: input.title,
    kind: input.kind,
    level: input.level,
    topic: input.topic,
    genre: input.genre,
    requestJson: input.request ? JSON.stringify(input.request) : '{}',
    contentJson: JSON.stringify(content),
    metricsJson: JSON.stringify(input.analysis.metrics),
  })
  insertTokens(id, input.analysis.tokens)
  return id
}

function parseRequest(raw: string | null): ArticleRequest | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as ArticleRequest
  } catch {
    return null
  }
}

function wordMetaFor(
  tokens: TokenRecord[],
  sentences: ArticleContent['sentences'],
  level: Level,
): WordMeta[] {
  const map = new Map<string, WordMeta>()
  for (const token of tokens) {
    if (token.status !== 'new' && token.status !== 'out_of_band') continue
    const existing = map.get(token.lemma)
    if (existing) {
      existing.count += 1
      continue
    }
    const entry = getEcdictEntry(token.lemma)
    map.set(token.lemma, {
      lemma: token.lemma,
      surface: token.surface,
      status: token.status,
      count: 1,
      firstSentenceIndex: token.sentenceIndex,
      firstSentenceText: sentences[token.sentenceIndex]?.text ?? '',
      band: inBand(token.lemma, level),
      frq: getFrequency(entry),
      translation: splitSenses(entry?.translation)[0] ?? null,
      phonetic: entry?.phonetic ?? null,
    })
  }
  return [...map.values()]
}

function audioState(
  articleId: string,
  voice: string,
  total: number,
  rows: ArticleAudioRow[],
): ArticleAudioState {
  const job = getTtsJobState(articleId, voice)
  let status: ArticleAudioState['status'] = 'idle'
  if (job.status === 'running') status = 'running'
  else if (job.status === 'done') status = 'done'
  else if (job.status === 'partial') status = 'partial'
  else if (rows.some((row) => row.status === 'ready')) status = 'partial'

  return {
    voice: voice as VoiceId,
    total,
    ready: rows.filter((row) => row.status === 'ready').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    status,
    provider: getTtsProviderInfo().provider,
  }
}

export function getArticleDTO(id: string, voiceArg?: string): ArticleRowDTO | null {
  const row = getArticleRow(id)
  if (!row) return null
  const content = JSON.parse(row.contentJson) as ArticleContent
  const request = parseRequest(row.requestJson)
  const voice = voiceArg || request?.voice || getDefaultVoice()
  const allTokens = getTokens(id)
  const audioRows = getArticleAudio(id, voice)
  const audioMap = new Map(audioRows.map((audio) => [audio.idx, audio]))

  const sentences: SentenceWithTokens[] = content.sentences.map((sentence) => {
    const audio = audioMap.get(sentence.index)
    const sentenceTokens = allTokens
      .filter((token) => token.sentenceIndex === sentence.index)
      .map((token) => ({
        ...token,
        start: token.start - sentence.start,
        end: token.end - sentence.start,
      }))
    return {
      ...sentence,
      tokens: sentenceTokens,
      audio:
        audio?.status === 'ready' && audio.hash
          ? {
              hash: audio.hash,
              url: `/api/audio/${audio.hash}`,
              durationMs: audio.durationMs,
              status: 'ready',
            }
          : audio
            ? {
                hash: audio.hash ?? '',
                url: '',
                durationMs: audio.durationMs,
                status: audio.status,
              }
            : undefined,
    }
  })

  return {
    id: row.id,
    title: row.title,
    kind: row.kind as ArticleKind,
    level: row.level as Level,
    topic: row.topic,
    genre: row.genre as ArticleRowDTO['genre'],
    createdAt: row.createdAt,
    metrics: JSON.parse(row.metricsJson),
    request,
    summaryZh: content.summaryZh ?? '',
    demo: Boolean(content.demo) || row.kind === 'demo',
    sentences,
    sentenceCount: sentences.length,
    audio: audioState(id, voice, sentences.length, audioRows),
    wordMeta: wordMetaFor(allTokens, content.sentences, row.level as Level),
  }
}

export function listArticleSummaries(limit = 50, kind?: ArticleKind) {
  return listArticleRows(limit, kind).map(buildSummaryDTO)
}

export function getArticleSummary(id: string) {
  const row = getArticleRow(id)
  if (!row) return null
  return buildSummaryDTO(row)
}

export function refreshArticleAnalysis(id: string): ArticleRowDTO | null {
  const row = getArticleRow(id)
  if (!row) return null
  const content = JSON.parse(row.contentJson) as ArticleContent
  const request = parseRequest(row.requestJson)
  const targets = request?.targets ?? content.targets ?? []
  const analysis = analyzeText(content.text, {
    level: row.level as Level,
    targets,
  })
  const nextContent: ArticleContent = {
    ...content,
    sentences: analysis.sentences,
    metrics: analysis.metrics,
  }
  updateArticleContent(id, JSON.stringify(nextContent), JSON.stringify(analysis.metrics))
  insertTokens(id, analysis.tokens)
  return getArticleDTO(id, request?.voice)
}

export function deleteArticle(id: string): void {
  deleteArticleRow(id)
}

export { parseRequest }
