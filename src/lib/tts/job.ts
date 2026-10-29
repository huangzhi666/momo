import fs from 'node:fs'
import { AppError } from '@/lib/errors'
import {
  getArticleAudio,
  getArticleRow,
  getTtsCacheRow,
  upsertArticleAudio,
  type ArticleAudioRow,
} from '@/lib/db/queries'
import { getTtsProviderInfo, synthesizeText } from './service'

export type TtsJobStatus = 'idle' | 'running' | 'done' | 'partial'

export interface TtsJobState {
  articleId: string
  voice: string
  status: TtsJobStatus
  total: number
  done: number
  failed: number
  currentIndex: number | null
  startedAt: string | null
  finishedAt: string | null
  errors: { index: number; message: string }[]
  provider: string
}

type Listener = (state: TtsJobState) => void

interface JobEntry {
  state: TtsJobState
  listeners: Set<Listener>
  lock: boolean
}

const globalJobs = globalThis as unknown as {
  __lexiloopTtsJobs?: Map<string, JobEntry>
}
const jobs = globalJobs.__lexiloopTtsJobs ?? new Map<string, JobEntry>()
globalJobs.__lexiloopTtsJobs = jobs

function keyOf(articleId: string, voice: string): string {
  return `${articleId}:${voice}`
}

function clone(state: TtsJobState): TtsJobState {
  return { ...state, errors: state.errors.map((e) => ({ ...e })) }
}

function emit(articleId: string, voice: string, state: TtsJobState): void {
  const entry = jobs.get(keyOf(articleId, voice))
  if (!entry) return
  entry.state = state
  for (const listener of entry.listeners) {
    try {
      listener(clone(state))
    } catch (error) {
      console.error('[tts] listener error', error)
    }
  }
}

export function getArticleSentences(articleId: string): { index: number; text: string }[] {
  const row = getArticleRow(articleId)
  if (!row) throw new AppError('NOT_FOUND', '文章不存在', 404)
  const content = JSON.parse(row.contentJson) as {
    sentences: { text: string }[]
  }
  return content.sentences.map((sentence, index) => ({ index, text: sentence.text }))
}

function audioFileExists(hash: string | null): boolean {
  if (!hash) return false
  const row = getTtsCacheRow(hash)
  return Boolean(row && fs.existsSync(row.path))
}

export function deriveState(articleId: string, voice: string): TtsJobState {
  const sentences = getArticleSentences(articleId)
  const rows = getArticleAudio(articleId, voice)
  const ready = rows.filter((row) => row.status === 'ready').length
  const failed = rows.filter((row) => row.status === 'failed').length
  const status: TtsJobStatus =
    sentences.length > 0 && ready >= sentences.length
      ? 'done'
      : ready > 0 || failed > 0
        ? 'partial'
        : 'idle'
  return {
    articleId,
    voice,
    status,
    total: sentences.length,
    done: ready,
    failed,
    currentIndex: null,
    startedAt: null,
    finishedAt: null,
    errors: rows
      .filter((row) => row.status === 'failed')
      .map((row) => ({ index: row.idx, message: row.error ?? '未知错误' })),
    provider: getTtsProviderInfo().provider,
  }
}

export function getTtsJobState(articleId: string, voice: string): TtsJobState {
  const entry = jobs.get(keyOf(articleId, voice))
  if (entry) return clone(entry.state)
  return deriveState(articleId, voice)
}

export function subscribeTts(
  articleId: string,
  voice: string,
  listener: Listener,
): () => void {
  const key = keyOf(articleId, voice)
  let entry = jobs.get(key)
  if (!entry) {
    const state = deriveState(articleId, voice)
    entry = { state, listeners: new Set(), lock: false }
    jobs.set(key, entry)
  }
  entry.listeners.add(listener)
  listener(clone(entry.state))
  return () => {
    entry?.listeners.delete(listener)
  }
}

export function startArticleTts(articleId: string, voice: string): TtsJobState {
  const key = keyOf(articleId, voice)
  let entry = jobs.get(key)
  if (entry?.state.status === 'running' && entry.lock) return clone(entry.state)

  const sentences = getArticleSentences(articleId)
  const rows = getArticleAudio(articleId, voice)
  const state: TtsJobState = {
    articleId,
    voice,
    status: 'running',
    total: sentences.length,
    done: 0,
    failed: 0,
    currentIndex: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    errors: [],
    provider: getTtsProviderInfo().provider,
  }
  if (!entry) {
    entry = { state, listeners: new Set(), lock: true }
    jobs.set(key, entry)
  } else {
    entry.state = state
    entry.lock = true
  }
  emit(articleId, voice, state)
  void runArticleTts(articleId, voice, sentences, rows).catch((error) => {
    console.error('[tts] job crashed', error)
    const current = jobs.get(key)
    if (current) {
      current.lock = false
      current.state = {
        ...current.state,
        status: 'partial',
        finishedAt: new Date().toISOString(),
        errors: [
          ...current.state.errors,
          { index: -1, message: error instanceof Error ? error.message : '未知错误' },
        ],
      }
      emit(articleId, voice, current.state)
    }
  })
  return clone(state)
}

async function runArticleTts(
  articleId: string,
  voice: string,
  sentences: { index: number; text: string }[],
  existing: ArticleAudioRow[],
): Promise<TtsJobState> {
  const entry = jobs.get(keyOf(articleId, voice))
  if (!entry) throw new Error('TTS job entry missing')
  const state: TtsJobState = entry.state
  const existingMap = new Map(existing.map((row) => [row.idx, row]))
  let done = 0
  let failed = 0

  for (const sentence of sentences) {
    const existingRow = existingMap.get(sentence.index)
    if (existingRow?.status === 'ready' && audioFileExists(existingRow.hash)) {
      done += 1
      state.done = done
      continue
    }

    state.currentIndex = sentence.index
    upsertArticleAudio({
      articleId,
      idx: sentence.index,
      voice,
      status: 'pending',
      hash: existingRow?.hash ?? null,
      durationMs: existingRow?.durationMs ?? 0,
    })
    emit(articleId, voice, state)

    try {
      const result = await synthesizeText(sentence.text, voice, {
        previousText: sentences[sentence.index - 1]?.text,
        nextText: sentences[sentence.index + 1]?.text,
        kind: 'sentence',
      })
      upsertArticleAudio({
        articleId,
        idx: sentence.index,
        voice,
        status: 'ready',
        hash: result.hash,
        durationMs: result.durationMs,
      })
      done += 1
      state.done = done
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : '未知错误'
      state.failed = failed
      state.errors.push({ index: sentence.index, message })
      upsertArticleAudio({
        articleId,
        idx: sentence.index,
        voice,
        status: 'failed',
        hash: null,
        durationMs: 0,
        error: message,
      })
    }
    emit(articleId, voice, state)
  }

  state.currentIndex = null
  state.done = done
  state.failed = failed
  state.status = failed > 0 ? 'partial' : 'done'
  state.finishedAt = new Date().toISOString()
  entry.lock = false
  entry.state = state
  emit(articleId, voice, state)
  return clone(state)
}

/** 种子脚本用：等待整篇音频生成完。 */
export async function prepareArticleAudio(articleId: string, voice: string): Promise<TtsJobState> {
  const key = keyOf(articleId, voice)
  let entry = jobs.get(key)
  if (entry?.state.status === 'running' && entry.lock) {
    return new Promise((resolve) => {
      const unsubscribe = subscribeTts(articleId, voice, (state) => {
        if (state.status !== 'running') {
          unsubscribe()
          resolve(state)
        }
      })
    })
  }
  startArticleTts(articleId, voice)
  return new Promise((resolve) => {
    let settled = false
    const unsubscribe = subscribeTts(articleId, voice, (state) => {
      if (state.status !== 'running' && !settled) {
        settled = true
        unsubscribe()
        resolve(state)
      }
    })
  })
}

export function clearJob(articleId: string, voice: string): void {
  jobs.delete(keyOf(articleId, voice))
}

export function resetTtsJobs(): void {
  jobs.clear()
}
