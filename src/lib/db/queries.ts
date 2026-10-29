import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb, getRawDb } from './index'
import { additions, articleAudio, articles, articleTokens, settings, ttsCache, vocab, wordLookup } from './schema'
import type { ArticleKind, ArticleMetrics, TokenRecord, TokenStatus } from '@/lib/types'
import type { Level } from '@/lib/constants'

const now = () => new Date().toISOString()

// ---------------- settings ----------------
export function getSetting(key: string): string | null {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get()
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb()
    .insert(settings)
    .values({ key, value, updatedAt: now() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now() } })
    .run()
}

export function getJsonSetting<T>(key: string, fallback: T): T {
  const raw = getSetting(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function setJsonSetting(key: string, value: unknown): void {
  setSetting(key, JSON.stringify(value))
}

// ---------------- vocab ----------------
export interface VocabRecord {
  vocId: string
  spelling: string
  lemma: string
  lastResponse: string | null
  studyCount: number
  tags: string[]
  addDate: string | null
  firstStudyDate: string | null
  lastStudyDate: string | null
  nextStudyDate: string | null
  syncedAt: string | null
  source: string
}

export function getVocabRecords(): VocabRecord[] {
  const rows = getDb().select().from(vocab).all()
  return rows.map((row) => ({
    vocId: row.vocId,
    spelling: row.spelling,
    lemma: row.lemma,
    lastResponse: row.lastResponse,
    studyCount: row.studyCount,
    tags: safeJsonArray(row.tags),
    addDate: row.addDate,
    firstStudyDate: row.firstStudyDate,
    lastStudyDate: row.lastStudyDate,
    nextStudyDate: row.nextStudyDate,
    syncedAt: row.syncedAt,
    source: row.source,
  }))
}

export function getVocabMap(): Map<string, VocabRecord> {
  const map = new Map<string, VocabRecord>()
  for (const record of getVocabRecords()) {
    if (!map.has(record.lemma)) map.set(record.lemma, record)
  }
  return map
}

export function getVocabCount(): number {
  const row = getDb().select({ count: sql<number>`count(*)` }).from(vocab).get()
  return Number(row?.count ?? 0)
}

export function getVocabSource(): 'maimemo' | 'demo' | 'mixed' | 'empty' {
  const rows = getDb()
    .select({ source: vocab.source, count: sql<number>`count(*)` })
    .from(vocab)
    .groupBy(vocab.source)
    .all()
  if (rows.length === 0) return 'empty'
  if (rows.length === 1) return rows[0].source === 'demo' ? 'demo' : 'maimemo'
  return 'mixed'
}

export interface VocabUpsertInput {
  vocId: string
  spelling: string
  lemma: string
  lastResponse?: string | null
  studyCount?: number
  tags?: string[]
  addDate?: string | null
  firstStudyDate?: string | null
  lastStudyDate?: string | null
  nextStudyDate?: string | null
  source?: string
}

export function upsertVocab(input: VocabUpsertInput): void {
  getDb()
    .insert(vocab)
    .values({
      vocId: input.vocId,
      spelling: input.spelling,
      lemma: input.lemma,
      lastResponse: input.lastResponse ?? null,
      studyCount: input.studyCount ?? 0,
      tags: JSON.stringify(input.tags ?? []),
      addDate: input.addDate ?? null,
      firstStudyDate: input.firstStudyDate ?? null,
      lastStudyDate: input.lastStudyDate ?? null,
      nextStudyDate: input.nextStudyDate ?? null,
      syncedAt: now(),
      source: input.source ?? 'maimemo',
    })
    .onConflictDoUpdate({
      target: vocab.vocId,
      set: {
        spelling: input.spelling,
        lemma: input.lemma,
        lastResponse: input.lastResponse ?? null,
        studyCount: input.studyCount ?? 0,
        tags: JSON.stringify(input.tags ?? []),
        addDate: input.addDate ?? null,
        firstStudyDate: input.firstStudyDate ?? null,
        lastStudyDate: input.lastStudyDate ?? null,
        nextStudyDate: input.nextStudyDate ?? null,
        syncedAt: now(),
        source: input.source ?? 'maimemo',
      },
    })
    .run()
}

export function replaceVocab(records: VocabUpsertInput[], source: 'maimemo' | 'demo'): void {
  const raw = getRawDb()
  const insert = raw.prepare(`
    INSERT INTO vocab (voc_id, spelling, lemma, last_response, study_count, tags, add_date,
      first_study_date, last_study_date, next_study_date, synced_at, source)
    VALUES (@vocId, @spelling, @lemma, @lastResponse, @studyCount, @tags, @addDate,
      @firstStudyDate, @lastStudyDate, @nextStudyDate, @syncedAt, @source)
    ON CONFLICT(voc_id) DO UPDATE SET
      spelling = excluded.spelling, lemma = excluded.lemma, last_response = excluded.last_response,
      study_count = excluded.study_count, tags = excluded.tags, add_date = excluded.add_date,
      first_study_date = excluded.first_study_date, last_study_date = excluded.last_study_date,
      next_study_date = excluded.next_study_date, synced_at = excluded.synced_at, source = excluded.source
  `)
  const tx = raw.transaction((rows: VocabUpsertInput[]) => {
    raw.prepare(`DELETE FROM vocab WHERE source = ?`).run(source)
    for (const r of rows) {
      insert.run({
        vocId: r.vocId,
        spelling: r.spelling,
        lemma: r.lemma,
        lastResponse: r.lastResponse ?? null,
        studyCount: r.studyCount ?? 0,
        tags: JSON.stringify(r.tags ?? []),
        addDate: r.addDate ?? null,
        firstStudyDate: r.firstStudyDate ?? null,
        lastStudyDate: r.lastStudyDate ?? null,
        nextStudyDate: r.nextStudyDate ?? null,
        syncedAt: now(),
        source: r.source ?? source,
      })
    }
  })
  tx(records)
}

export function addDemoVocab(record: VocabUpsertInput): void {
  upsertVocab({ ...record, source: 'demo' })
}

// ---------------- articles ----------------
export interface InsertArticleInput {
  id: string
  title: string
  kind: ArticleKind
  level: Level
  topic: string
  genre: string
  requestJson: string
  contentJson: string
  metricsJson: string
  createdAt?: string
}

export function insertArticle(input: InsertArticleInput): void {
  getDb()
    .insert(articles)
    .values({
      id: input.id,
      title: input.title,
      kind: input.kind,
      level: input.level,
      topic: input.topic,
      genre: input.genre,
      requestJson: input.requestJson,
      contentJson: input.contentJson,
      metricsJson: input.metricsJson,
      createdAt: input.createdAt ?? now(),
    })
    .run()
}

export function getArticleRow(id: string) {
  return getDb().select().from(articles).where(eq(articles.id, id)).get()
}

export function listArticleRows(limit = 50, kind?: ArticleKind) {
  const query = getDb().select().from(articles)
  if (kind) {
    return query.where(eq(articles.kind, kind)).orderBy(desc(articles.createdAt)).limit(limit).all()
  }
  return query.orderBy(desc(articles.createdAt)).limit(limit).all()
}

export function recentArticleRows(limit = 5) {
  return getDb().select().from(articles).orderBy(desc(articles.createdAt)).limit(limit).all()
}

export function deleteArticleRow(id: string): void {
  getDb().delete(articles).where(eq(articles.id, id)).run()
}

export function updateArticleContent(
  id: string,
  contentJson: string,
  metricsJson: string,
): void {
  getDb().update(articles).set({ contentJson, metricsJson }).where(eq(articles.id, id)).run()
}

// ---------------- article tokens ----------------
export function insertTokens(articleId: string, tokens: TokenRecord[]): void {
  const raw = getRawDb()
  const stmt = raw.prepare(`
    INSERT INTO article_tokens (article_id, idx, surface, normalized, lemma, status, paragraph,
      sentence_index, start_offset, end_offset, known_response, repeat)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const tx = raw.transaction((rows: TokenRecord[]) => {
    raw.prepare('DELETE FROM article_tokens WHERE article_id = ?').run(articleId)
    for (const t of rows) {
      stmt.run(
        articleId,
        t.idx,
        t.surface,
        t.normalized,
        t.lemma,
        t.status,
        t.paragraph,
        t.sentenceIndex,
        t.start,
        t.end,
        t.knownResponse ?? null,
        t.repeat ? 1 : 0,
      )
    }
  })
  tx(tokens)
}

export function getTokens(articleId: string): TokenRecord[] {
  const rows = getDb()
    .select()
    .from(articleTokens)
    .where(eq(articleTokens.articleId, articleId))
    .orderBy(articleTokens.idx)
    .all()
  return rows.map((row) => ({
    idx: row.idx,
    start: row.startOffset,
    end: row.endOffset,
    surface: row.surface,
    normalized: row.normalized,
    lemma: row.lemma,
    status: row.status as TokenStatus,
    sentenceIndex: row.sentenceIndex,
    paragraph: row.paragraph,
    knownResponse: row.knownResponse,
    repeat: Boolean(row.repeat),
  }))
}

// ---------------- word lookup cache ----------------
export function getWordLookup<T>(lemma: string): { payload: T; fetchedAt: string } | null {
  const row = getDb().select().from(wordLookup).where(eq(wordLookup.lemma, lemma)).get()
  if (!row) return null
  try {
    return { payload: JSON.parse(row.payloadJson) as T, fetchedAt: row.fetchedAt }
  } catch {
    return null
  }
}

export function putWordLookup(lemma: string, payload: unknown): void {
  getDb()
    .insert(wordLookup)
    .values({ lemma, payloadJson: JSON.stringify(payload), fetchedAt: now() })
    .onConflictDoUpdate({
      target: wordLookup.lemma,
      set: { payloadJson: JSON.stringify(payload), fetchedAt: now() },
    })
    .run()
}

// ---------------- additions ----------------
export interface AdditionRecord {
  lemma: string
  vocId: string | null
  spelling: string
  status: 'pending' | 'synced' | 'failed'
  error: string | null
  simulated: boolean
  createdAt: string
  updatedAt: string
}

export function getAddition(lemma: string): AdditionRecord | null {
  const row = getDb().select().from(additions).where(eq(additions.lemma, lemma)).get()
  if (!row) return null
  return {
    lemma: row.lemma,
    vocId: row.vocId,
    spelling: row.spelling,
    status: row.status as AdditionRecord['status'],
    error: row.error,
    simulated: Boolean(row.simulated),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function listAdditions(limit = 100): AdditionRecord[] {
  const rows = getDb().select().from(additions).orderBy(desc(additions.updatedAt)).limit(limit).all()
  return rows.map((row) => ({
    lemma: row.lemma,
    vocId: row.vocId,
    spelling: row.spelling,
    status: row.status as AdditionRecord['status'],
    error: row.error,
    simulated: Boolean(row.simulated),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

export function upsertAddition(input: {
  lemma: string
  vocId?: string | null
  spelling: string
  status: 'pending' | 'synced' | 'failed'
  error?: string | null
  simulated?: boolean
}): void {
  const timestamp = now()
  getDb()
    .insert(additions)
    .values({
      lemma: input.lemma,
      vocId: input.vocId ?? null,
      spelling: input.spelling,
      status: input.status,
      error: input.error ?? null,
      simulated: input.simulated ? 1 : 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: additions.lemma,
      set: {
        vocId: input.vocId ?? null,
        spelling: input.spelling,
        status: input.status,
        error: input.error ?? null,
        simulated: input.simulated ? 1 : 0,
        updatedAt: timestamp,
      },
    })
    .run()
}

// ---------------- tts cache ----------------
export interface TtsCacheRow {
  hash: string
  path: string
  durationMs: number
  voice: string
  provider: string
  model: string | null
  text: string
  createdAt: string
}

export function getTtsCacheRow(hash: string): TtsCacheRow | null {
  const row = getDb().select().from(ttsCache).where(eq(ttsCache.hash, hash)).get()
  return row ? { ...row } : null
}

export function insertTtsCache(input: {
  hash: string
  path: string
  durationMs: number
  voice: string
  provider: string
  model?: string | null
  text: string
}): void {
  getDb()
    .insert(ttsCache)
    .values({
      hash: input.hash,
      path: input.path,
      durationMs: input.durationMs,
      voice: input.voice,
      provider: input.provider,
      model: input.model ?? null,
      text: input.text,
      createdAt: now(),
    })
    .onConflictDoUpdate({
      target: ttsCache.hash,
      set: {
        path: input.path,
        durationMs: input.durationMs,
        voice: input.voice,
        provider: input.provider,
        model: input.model ?? null,
        text: input.text,
      },
    })
    .run()
}

export function countTtsCache(): number {
  const row = getDb().select({ count: sql<number>`count(*)` }).from(ttsCache).get()
  return Number(row?.count ?? 0)
}

// ---------------- article audio ----------------
export interface ArticleAudioRow {
  articleId: string
  idx: number
  voice: string
  hash: string | null
  durationMs: number
  status: 'pending' | 'ready' | 'failed'
  error: string | null
  updatedAt: string
}

export function getArticleAudio(articleId: string, voice: string): ArticleAudioRow[] {
  return getDb()
    .select()
    .from(articleAudio)
    .where(and(eq(articleAudio.articleId, articleId), eq(articleAudio.voice, voice)))
    .orderBy(articleAudio.idx)
    .all()
    .map((row) => ({ ...row, status: row.status as ArticleAudioRow['status'] }))
}

export function upsertArticleAudio(input: {
  articleId: string
  idx: number
  voice: string
  hash?: string | null
  durationMs?: number
  status: 'pending' | 'ready' | 'failed'
  error?: string | null
}): void {
  getDb()
    .insert(articleAudio)
    .values({
      articleId: input.articleId,
      idx: input.idx,
      voice: input.voice,
      hash: input.hash ?? null,
      durationMs: input.durationMs ?? 0,
      status: input.status,
      error: input.error ?? null,
      updatedAt: now(),
    })
    .onConflictDoUpdate({
      target: [articleAudio.articleId, articleAudio.idx, articleAudio.voice],
      set: {
        hash: input.hash ?? null,
        durationMs: input.durationMs ?? 0,
        status: input.status,
        error: input.error ?? null,
        updatedAt: now(),
      },
    })
    .run()
}

// ---------------- misc ----------------
function safeJsonArray(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function countRows(table: 'articles' | 'vocab' | 'tts_cache'): number {
  const row = getRawDb().prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number }
  return Number(row?.c ?? 0)
}

export function parseMetrics(raw: string): ArticleMetrics {
  return JSON.parse(raw) as ArticleMetrics
}
