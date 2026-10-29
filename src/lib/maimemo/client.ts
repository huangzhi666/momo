import { AppError } from '@/lib/errors'
import { getMaimemoToken } from '@/lib/env'
import {
  addWordsPayloadSchema,
  normalizeRecord,
  normalizeTags,
  progressPayloadSchema,
  type MaimemoStudyRecord,
} from './schemas'
import { maimemoLimiter, type MaimemoRateLimiter } from './rate-limit'

const DEFAULT_BASE = 'https://open.maimemo.com/open/api/v1'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class MaimemoError extends AppError {
  status: number
  retryAfterSeconds: number | null

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(status === 429 ? 'MAIMEMO_RATE_LIMIT' : 'MAIMEMO_ERROR', message, status)
    this.name = 'MaimemoError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function formatBeijing(date: Date): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return `${shifted.toISOString().slice(0, 19)}+08:00`
}

function maskId(id: string): string {
  if (id.length <= 8) return `${id.slice(0, 2)}***`
  return `${id.slice(0, 6)}…${id.slice(-2)}`
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(1, Math.round(seconds))
  const date = new Date(header).getTime()
  if (!Number.isNaN(date)) return Math.max(1, Math.ceil((date - Date.now()) / 1000))
  return null
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface MaimemoClientOptions {
  token?: string | null
  baseUrl?: string
  fetchImpl?: FetchLike
  limiter?: Pick<MaimemoRateLimiter, 'acquire'>
  sleep?: (ms: number) => Promise<void>
  maxRetries?: number
}

export class MaimemoClient {
  private token: string | null
  private baseUrl: string
  private fetchImpl: FetchLike
  private limiter: Pick<MaimemoRateLimiter, 'acquire'>
  private sleepFn: (ms: number) => Promise<void>
  private maxRetries: number
  private resolved = new Map<string, string>()

  constructor(options: MaimemoClientOptions = {}) {
    this.token = options.token ?? getMaimemoToken()
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
    this.limiter = options.limiter ?? maimemoLimiter
    this.sleepFn = options.sleep ?? delay
    this.maxRetries = options.maxRetries ?? 5
  }

  get configured(): boolean {
    return Boolean(this.token)
  }

  private requireToken(): string {
    if (!this.token) {
      throw new AppError(
        'CONFIG',
        '未配置 MAIMEMO_API_TOKEN。请在 .env.local 中填入墨墨开放 API Token。',
        400,
      )
    }
    return this.token
  }

  private pathCandidates(key: string, paths: string[]): string[] {
    const remembered = this.resolved.get(key)
    if (remembered) return [remembered, ...paths.filter((path) => path !== remembered)]
    return paths
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let attempt = 0
    for (;;) {
      await this.limiter.acquire()
      const response = await this.fetchImpl(url, init)
      if (response.status !== 429) return response
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'))
      if (attempt >= this.maxRetries) {
        throw new MaimemoError(
          '墨墨接口触发频控（429），已达到最大重试次数。请稍后再试。',
          429,
          retryAfter,
        )
      }
      const waitSeconds = retryAfter ?? 20 * 2 ** attempt
      console.warn(`[maimemo] 429，${waitSeconds}s 后重试（第 ${attempt + 1} 次）`)
      await this.sleepFn(waitSeconds * 1000)
      attempt += 1
    }
  }

  private async request<T>(
    key: string,
    paths: string[],
    options: {
      method: 'GET' | 'POST'
      body?: Record<string, unknown>
      query?: Record<string, string>
      log?: Record<string, unknown>
      normalize: (payload: unknown) => T
    },
  ): Promise<T> {
    const token = this.requireToken()
    const candidates = this.pathCandidates(key, paths)
    let lastStatus = 0
    let lastDetail = ''

    for (let index = 0; index < candidates.length; index += 1) {
      const path = candidates[index]
      const search = options.query ? `?${new URLSearchParams(options.query).toString()}` : ''
      const url = `${this.baseUrl}${path}${search}`
      console.info(`[maimemo] ${options.method} ${path}`, options.log ?? {})
      const init: RequestInit = {
        method: options.method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(60_000),
      }

      const response = await this.fetchWithRetry(url, init)
      const text = await response.text()

      if (response.status === 404 && index < candidates.length - 1) {
        console.warn(`[maimemo] ${path} 返回 404，尝试兼容路径 ${candidates[index + 1]}`)
        lastStatus = 404
        lastDetail = text.slice(0, 200)
        continue
      }

      if (response.status === 401 || response.status === 403) {
        throw new MaimemoError(
          `墨墨 Token 无效或已过期（HTTP ${response.status}）。请重新获取 Token 并更新 .env.local。`,
          response.status,
        )
      }
      if (!response.ok) {
        throw new MaimemoError(
          `墨墨接口失败（HTTP ${response.status}）：${text.slice(0, 300) || '无响应体'}`,
          response.status,
        )
      }

      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        throw new MaimemoError('墨墨接口返回了非 JSON 内容，请稍后重试。', response.status)
      }

      const root = json as {
        success?: boolean
        data?: unknown
        errors?: unknown[]
      }
      if (root.success === false) {
        const detail =
          Array.isArray(root.errors) && root.errors.length
            ? JSON.stringify(root.errors).slice(0, 300)
            : 'success=false'
        throw new MaimemoError(`墨墨接口返回失败：${detail}`, response.status)
      }
      const payload = root.data !== undefined ? root.data : json
      this.resolved.set(key, path)
      return options.normalize(payload)
    }

    throw new MaimemoError(
      `墨墨接口路径不可用（404）：${lastDetail || lastStatus}`,
      404,
    )
  }

  async countStudyRecords(start?: Date, end?: Date): Promise<number> {
    return this.request('studyCount', ['/memo/study/query_study_records', '/study/query_study_records'], {
      method: 'POST',
      body: {
        ...(start && end
          ? { next_study_date: { start: formatBeijing(start), end: formatBeijing(end) } }
          : {}),
        as_count: true,
      },
      log: { start: start?.toISOString(), end: end?.toISOString(), asCount: true },
      normalize: (payload) => {
        const data = payload as { count?: unknown; records?: unknown[] }
        if (typeof data.count === 'number') return data.count
        if (typeof data.count === 'string' && Number.isFinite(Number(data.count))) {
          return Number(data.count)
        }
        return Array.isArray(data.records) ? data.records.length : 0
      },
    })
  }

  async queryStudyRecords(start: Date, end: Date, limit = 1000): Promise<MaimemoStudyRecord[]> {
    return this.request('studyQuery', ['/memo/study/query_study_records', '/study/query_study_records'], {
      method: 'POST',
      body: {
        next_study_date: { start: formatBeijing(start), end: formatBeijing(end) },
        limit,
      },
      log: { start: start.toISOString(), end: end.toISOString(), limit },
      normalize: (payload) => {
        const data = payload as { records?: unknown[] }
        if (!Array.isArray(data.records)) return []
        return data.records
          .map((record) => normalizeRecord(record))
          .filter((record): record is MaimemoStudyRecord => Boolean(record))
      },
    })
  }

  async addWords(ids: string[]): Promise<number> {
    const unique = [...new Set(ids.filter(Boolean))].slice(0, 1000)
    if (unique.length === 0) return 0
    return this.request('studyAdd', ['/memo/study/add_words', '/study/add_words'], {
      method: 'POST',
      body: {
        words: unique.map((id) => ({ id })),
        advance: false,
      },
      log: { words: unique.map(maskId), advance: false, count: unique.length },
      normalize: (payload) => {
        const parsed = addWordsPayloadSchema.safeParse(payload)
        if (!parsed.success) {
          throw new MaimemoError('add_words 返回结构无法识别', 502)
        }
        console.info('[maimemo] add_words response', {
          added_count: parsed.data.added_count,
          requested: unique.length,
        })
        return parsed.data.added_count
      },
    })
  }

  async queryVocabulary(spellings: string[]): Promise<{ id: string; spelling: string }[]> {
    const unique = [...new Set(spellings.map((s) => s.trim()).filter(Boolean))].slice(0, 1000)
    if (unique.length === 0) return []
    return this.request('vocabQuery', ['/memo/vocabulary/query', '/vocabulary/query'], {
      method: 'POST',
      body: { spellings: unique },
      log: { spellings: unique.map((s) => (s.length > 18 ? `${s.slice(0, 16)}…` : s)), count: unique.length },
      normalize: (payload) => {
        const data = payload as {
          voc?: unknown
          records?: unknown
        }
        const list = Array.isArray(data.voc)
          ? data.voc
          : Array.isArray(data.records)
            ? data.records
            : data.voc && typeof data.voc === 'object'
              ? [data.voc]
              : []
        return list
          .map((item) => {
            const value = item as { id?: unknown; spelling?: unknown }
            if (typeof value.id !== 'string' || typeof value.spelling !== 'string') return null
            return { id: value.id, spelling: value.spelling }
          })
          .filter((item): item is { id: string; spelling: string } => Boolean(item))
      },
    })
  }

  async getVocabulary(spelling: string): Promise<{ id: string; spelling: string } | null> {
    return this.request('vocabOne', ['/memo/vocabulary', '/vocabulary'], {
      method: 'GET',
      query: { spelling },
      normalize: (payload) => {
        const data = payload as { voc?: unknown }
        const raw = Array.isArray(data.voc) ? data.voc[0] : data.voc
        const value = raw as { id?: unknown; spelling?: unknown } | undefined
        if (!value || typeof value.id !== 'string' || typeof value.spelling !== 'string') return null
        return { id: value.id, spelling: value.spelling }
      },
    })
  }

  async getStudyProgress(): Promise<{ finished: number; total: number; studyTime: number }> {
    return this.request('studyProgress', ['/memo/study/get_study_progress', '/study/get_study_progress'], {
      method: 'POST',
      normalize: (payload) => {
        const parsed = progressPayloadSchema.safeParse(payload)
        const progress = parsed.success ? parsed.data.progress : undefined
        return {
          finished: progress?.finished ?? 0,
          total: progress?.total ?? 0,
          studyTime: progress?.study_time ?? 0,
        }
      },
    })
  }

  async getTodayItems(params: { spellings?: string[]; limit?: number } = {}): Promise<unknown[]> {
    return this.request('todayItems', ['/memo/study/get_today_items', '/study/get_today_items'], {
      method: 'POST',
      body: {
        ...(params.spellings ? { spellings: params.spellings.slice(0, 1000) } : {}),
        limit: params.limit ?? 50,
      },
      normalize: (payload) => {
        const data = payload as { today_items?: unknown[] }
        return Array.isArray(data.today_items) ? data.today_items : []
      },
    })
  }

  async advanceStudy(vocIds: string[]): Promise<number> {
    return this.request('advanceStudy', ['/memo/study/advance_study', '/study/advance_study'], {
      method: 'POST',
      body: { voc_ids: [...new Set(vocIds)].slice(0, 1000) },
      normalize: (payload) => {
        const data = payload as { advanced_count?: unknown }
        return typeof data.advanced_count === 'number' ? data.advanced_count : 0
      },
    })
  }

  async getPersonalContent(vocId: string): Promise<{
    interpretations: string[]
    phrases: string[]
    notes: string[]
  }> {
    const empty = { interpretations: [], phrases: [], notes: [] }
    if (!this.configured) return empty
    const [interpretations, phrases, notes] = await Promise.allSettled([
      this.getResource(['/memo/interpretations', '/interpretations'], 'interpretations', vocId),
      this.getResource(['/memo/phrases', '/phrases'], 'phrases', vocId),
      this.getResource(['/memo/notes', '/notes'], 'notes', vocId),
    ])
    return {
      interpretations: interpretations.status === 'fulfilled' ? interpretations.value : [],
      phrases: phrases.status === 'fulfilled' ? phrases.value : [],
      notes: notes.status === 'fulfilled' ? notes.value : [],
    }
  }

  private async getResource(paths: string[], key: string, vocId: string): Promise<string[]> {
    try {
      return await this.request(`personal:${key}`, paths, {
        method: 'GET',
        query: { voc_id: vocId },
        normalize: (payload) => {
          const data = payload as Record<string, unknown>
          const raw = data[key]
          if (!Array.isArray(raw)) return []
          const out: string[] = []
          for (const item of raw) {
            if (typeof item === 'string') {
              out.push(item)
              continue
            }
            const value = item as Record<string, unknown>
            const text =
              value.content ??
              value.text ??
              value.phrase ??
              value.interpretation ??
              value.note ??
              value.meaning ??
              value.value
            if (typeof text === 'string' && text.trim()) out.push(text.trim())
          }
          return out.slice(0, 8)
        },
      })
    } catch (error) {
      console.warn(`[maimemo] 个人内容 ${key} 读取失败`, error instanceof Error ? error.message : error)
      return []
    }
  }
}

export function getMaimemoClient(options?: MaimemoClientOptions): MaimemoClient {
  return new MaimemoClient(options)
}

export function normalizeStudyTags(tags: string | string[] | null | undefined): string[] {
  return normalizeTags(tags)
}
