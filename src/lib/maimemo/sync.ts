import fs from 'node:fs'
import path from 'node:path'
import { getDataDir, getMaimemoToken, isDemoMode } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { getRawDb } from '@/lib/db'
import { getSetting, replaceVocab, setSetting, type VocabUpsertInput } from '@/lib/db/queries'
import { resolveLemma } from '@/lib/dict/lemma'
import { MaimemoClient } from './client'
import type { MaimemoStudyRecord } from './schemas'

const MIN_DATE = new Date('2000-01-01T00:00:00Z')
const MAX_DATE = new Date('2100-01-01T00:00:00Z')
const MAX_WINDOW = 1000
const STATE_VERSION = 1

export interface VocabSyncProgress {
  running: boolean
  phase: 'idle' | 'count' | 'fetch' | 'done' | 'error'
  requests: number
  found: number
  queue: number
  totalReported: number
  message: string
  startedAt: string | null
  finishedAt: string | null
  error: string | null
}

interface PersistedSyncState {
  version: number
  queue: [string, string][]
  processed: string[]
  records: MaimemoStudyRecord[]
  requests: number
  totalReported: number
  /** 全量 as_count 的权威总数，用于计算 missing。 */
  planTotal?: number
  startedAt: string
}

type SyncClient = Pick<MaimemoClient, 'countStudyRecords' | 'queryStudyRecords'>

const globalSync = globalThis as unknown as {
  __lexiloopSyncState?: VocabSyncProgress
  __lexiloopSyncListeners?: Set<(progress: VocabSyncProgress) => void>
}

let state: VocabSyncProgress =
  globalSync.__lexiloopSyncState ??
  ({
    running: false,
    phase: 'idle',
    requests: 0,
    found: 0,
    queue: 0,
    totalReported: 0,
    message: '尚未同步',
    startedAt: null,
    finishedAt: null,
    error: null,
  } satisfies VocabSyncProgress)
globalSync.__lexiloopSyncState = state
const listeners = globalSync.__lexiloopSyncListeners ?? new Set()
globalSync.__lexiloopSyncListeners = listeners

function setState(patch: Partial<VocabSyncProgress>): void {
  state = { ...state, ...patch }
  globalSync.__lexiloopSyncState = state
  for (const listener of listeners) {
    try {
      listener({ ...state })
    } catch {
      // ignore
    }
  }
}

export function getVocabSyncState(): VocabSyncProgress {
  // 服务重启后内存状态会回到 idle；此时用持久化的上次同步摘要恢复展示。
  if (state.phase === 'idle') {
    const last = getLastSyncAt()
    if (last) {
      let summary: {
        unique?: number
        totalReported?: number
        requests?: number
        missing?: number
      } = {}
      try {
        summary = JSON.parse(getSetting('vocabSyncSummary') ?? '{}')
      } catch {
        summary = {}
      }
      return {
        ...state,
        phase: 'done',
        running: false,
        message: `上次同步完成：${summary.unique ?? 0} 个词，${summary.requests ?? 0} 次请求，缺失 ${summary.missing ?? 0} 条。`,
        requests: summary.requests ?? 0,
        found: summary.unique ?? 0,
        queue: 0,
        totalReported: summary.totalReported ?? 0,
        finishedAt: last,
        error: null,
      }
    }
  }
  return { ...state }
}

export function subscribeVocabSync(listener: (progress: VocabSyncProgress) => void): () => void {
  listeners.add(listener)
  listener({ ...state })
  return () => listeners.delete(listener)
}

function stateFile(override?: string): string {
  if (override) return override
  const dir = path.join(getDataDir(), 'tmp')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'vocab-sync.json')
}

function loadPartial(file: string): PersistedSyncState | null {
  if (!fs.existsSync(file)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as PersistedSyncState
    if (parsed.version !== STATE_VERSION || !Array.isArray(parsed.queue)) return null
    return parsed
  } catch {
    return null
  }
}

function savePartial(file: string, partial: PersistedSyncState): void {
  fs.writeFileSync(file, JSON.stringify(partial), 'utf8')
}

function windowKey(start: Date, end: Date): string {
  return `${start.toISOString()}|${end.toISOString()}`
}

function toVocabInputs(records: MaimemoStudyRecord[]): VocabUpsertInput[] {
  return records.map((record) => ({
    vocId: record.vocId,
    spelling: record.spelling,
    lemma: resolveLemma(record.spelling),
    lastResponse: record.lastResponse,
    studyCount: record.studyCount,
    tags: record.tags,
    addDate: record.addDate,
    firstStudyDate: record.firstStudyDate,
    lastStudyDate: record.lastStudyDate,
    nextStudyDate: record.nextStudyDate,
    source: 'maimemo',
  }))
}

export interface RunSyncOptions {
  client?: SyncClient
  reset?: boolean
  stateFile?: string
  onProgress?: (progress: VocabSyncProgress) => void
}

export async function runVocabSync(options: RunSyncOptions = {}): Promise<VocabSyncProgress> {
  const client = options.client ?? new MaimemoClient()
  if (options.client === undefined && !getMaimemoToken()) {
    throw new AppError(
      'CONFIG',
      '未配置 MAIMEMO_API_TOKEN。Demo 模式下无法同步墨墨词库。',
      400,
    )
  }
  const file = stateFile(options.stateFile)
  if (options.reset && fs.existsSync(file)) fs.rmSync(file, { force: true })
  const partial: PersistedSyncState =
    loadPartial(file) ?? {
      version: STATE_VERSION,
      queue: [[MIN_DATE.toISOString(), MAX_DATE.toISOString()]],
      processed: [],
      records: [],
      requests: 0,
      totalReported: 0,
      startedAt: new Date().toISOString(),
    }
  if (partial.queue.length === 0 && partial.records.length === 0) {
    partial.queue = [[MIN_DATE.toISOString(), MAX_DATE.toISOString()]]
  }

  const recordMap = new Map(partial.records.map((record) => [record.vocId, record]))
  let requests = partial.requests
  let totalReported = partial.totalReported
  let planTotal = partial.planTotal
  const processed = new Set(partial.processed)

  const emit = (patch: Partial<VocabSyncProgress>) => {
    setState(patch)
    options.onProgress?.({ ...state })
  }

  emit({
    running: true,
    phase: 'count',
    requests,
    found: recordMap.size,
    queue: partial.queue.length,
    totalReported,
    message: '开始同步词库…',
    startedAt: partial.startedAt,
    finishedAt: null,
    error: null,
  })

  try {
    // 断点续传的旧状态可能没有 planTotal；此时用日期窗口的总数补齐。
    // 注意不要用无日期的 as_count：它包含 next_study_date 为空的 7 条记录。
    const rootKey = `${MIN_DATE.toISOString()}|${MAX_DATE.toISOString()}`
    const rootInQueue = partial.queue.some(([s, e]) => `${s}|${e}` === rootKey)
    if (planTotal === undefined && !rootInQueue) {
      planTotal = await client.countStudyRecords(MIN_DATE, MAX_DATE)
      requests += 1
      partial.planTotal = planTotal
      partial.requests = requests
      savePartial(file, partial)
      emit({
        phase: 'count',
        requests,
        found: recordMap.size,
        queue: partial.queue.length,
        totalReported,
        message: `词库总数 ${planTotal}（日期窗口），继续同步…`,
      })
    }

    while (partial.queue.length > 0) {
      const [startIso, endIso] = partial.queue.shift() as [string, string]
      const start = new Date(startIso)
      const end = new Date(endIso)
      const key = windowKey(start, end)
      if (processed.has(key)) continue

      emit({
        phase: 'count',
        requests,
        found: recordMap.size,
        queue: partial.queue.length + 1,
        totalReported,
        message: `统计时间窗 ${startIso.slice(0, 10)} → ${endIso.slice(0, 10)}…`,
      })
      const count = await client.countStudyRecords(start, end)
      requests += 1

      if (
        planTotal === undefined &&
        start.getTime() === MIN_DATE.getTime() &&
        end.getTime() === MAX_DATE.getTime()
      ) {
        planTotal = count
        partial.planTotal = planTotal
        emit({
          phase: 'count',
          requests,
          found: recordMap.size,
          queue: partial.queue.length,
          totalReported,
          message: `词库总数 ${planTotal}（日期窗口），开始按时间窗同步…`,
        })
      }

      if (count === 0) {
        processed.add(key)
        partial.requests = requests
        partial.processed = [...processed]
        partial.records = [...recordMap.values()]
        savePartial(file, partial)
        continue
      }

      if (count > MAX_WINDOW) {
        const mid = new Date((start.getTime() + end.getTime()) / 2)
        if (mid.getTime() <= start.getTime() || mid.getTime() >= end.getTime()) {
          throw new AppError('MAIMEMO_ERROR', '时间窗无法继续二分，请检查接口的日期过滤行为。', 502)
        }
        // 接口的 start/end 都可能是闭区间；左窗口减去 1ms，避免边界记录被统计两次。
        const leftEnd = new Date(mid.getTime() - 1)
        partial.queue.push([start.toISOString(), leftEnd.toISOString()])
        partial.queue.push([mid.toISOString(), end.toISOString()])
        partial.requests = requests
        partial.processed = [...processed]
        partial.records = [...recordMap.values()]
        if (planTotal !== undefined) partial.planTotal = planTotal
        savePartial(file, partial)
        emit({
          phase: 'count',
          requests,
          found: recordMap.size,
          queue: partial.queue.length,
          totalReported,
          message: `窗口内 ${count} 条，二分后继续…`,
        })
        continue
      }

      emit({
        phase: 'fetch',
        requests,
        found: recordMap.size,
        queue: partial.queue.length + 1,
        totalReported,
        message: `抓取 ${count} 条学习记录…`,
      })
      const records = await client.queryStudyRecords(start, end, MAX_WINDOW)
      requests += 1
      for (const record of records) recordMap.set(record.vocId, record)
      totalReported += count
      processed.add(key)
      partial.requests = requests
      partial.processed = [...processed]
      partial.records = [...recordMap.values()]
      partial.totalReported = totalReported
      savePartial(file, partial)
      emit({
        phase: 'fetch',
        requests,
        found: recordMap.size,
        queue: partial.queue.length,
        totalReported,
        message: `已抓取 ${recordMap.size} 个词，剩余 ${partial.queue.length} 个时间窗…`,
      })
    }

    const unique = [...recordMap.values()]
    if (unique.length === 0) {
      throw new AppError('MAIMEMO_ERROR', '同步结果为空，未覆盖本地词库。请检查 Token 或稍后重试。', 502)
    }
    replaceVocab(toVocabInputs(unique), 'maimemo')
    getRawDb().prepare("DELETE FROM vocab WHERE source <> 'maimemo'").run()
    const finishedAt = new Date().toISOString()
    const missing = Math.max(0, (planTotal ?? totalReported) - unique.length)
    setSetting('vocabLastSync', finishedAt)
    setSetting(
      'vocabSyncSummary',
      JSON.stringify({
        unique: unique.length,
        planTotal: planTotal ?? null,
        totalReported,
        requests,
        missing,
        finishedAt,
      }),
    )
    fs.rmSync(file, { force: true })

    emit({
      running: false,
      phase: 'done',
      requests,
      found: unique.length,
      queue: 0,
      totalReported,
      message: `同步完成：${unique.length} 个词，${requests} 次请求，缺失 ${missing} 条。`,
      finishedAt,
      error: null,
    })
    return { ...state }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    emit({
      running: false,
      phase: 'error',
      requests,
      found: recordMap.size,
      queue: partial.queue.length,
      totalReported,
      message: `同步失败：${message}`,
      finishedAt: new Date().toISOString(),
      error: message,
    })
    throw error
  }
}

export function startVocabSync(options: { reset?: boolean } = {}): VocabSyncProgress {
  if (state.running) return { ...state }
  setState({
    running: true,
    phase: 'count',
    requests: 0,
    found: 0,
    queue: 1,
    totalReported: 0,
    message: '准备同步…',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  })
  void runVocabSync({
    reset: options.reset,
    onProgress: (progress) => {
      globalSync.__lexiloopSyncState = progress
    },
  }).catch((error) => {
    console.error('[sync] failed', error)
    setState({
      running: false,
      phase: 'error',
      message: `同步失败：${error instanceof Error ? error.message : '未知错误'}`,
      error: error instanceof Error ? error.message : '未知错误',
      finishedAt: new Date().toISOString(),
    })
  })
  return { ...state }
}

export function getLastSyncAt(): string | null {
  return getSetting('vocabLastSync')
}

export function isSyncStale(ttlHours = 24): boolean {
  const last = getLastSyncAt()
  if (!last) return true
  const time = new Date(last).getTime()
  if (Number.isNaN(time)) return true
  return Date.now() - time > ttlHours * 60 * 60 * 1000
}

export function maybeRefreshVocab(): boolean {
  if (isDemoMode() || state.running || !isSyncStale(24)) return false
  startVocabSync()
  return true
}
