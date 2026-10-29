import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const vocab = sqliteTable(
  'vocab',
  {
    vocId: text('voc_id').primaryKey(),
    spelling: text('spelling').notNull(),
    lemma: text('lemma').notNull(),
    lastResponse: text('last_response'),
    studyCount: integer('study_count').notNull().default(0),
    tags: text('tags').notNull().default('[]'),
    addDate: text('add_date'),
    firstStudyDate: text('first_study_date'),
    lastStudyDate: text('last_study_date'),
    nextStudyDate: text('next_study_date'),
    syncedAt: text('synced_at'),
    source: text('source').notNull().default('maimemo'),
  },
  (table) => [index('vocab_lemma_idx').on(table.lemma), index('vocab_source_idx').on(table.source)],
)

export const articles = sqliteTable(
  'articles',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    kind: text('kind').notNull().default('generated'),
    level: text('level').notNull(),
    topic: text('topic').notNull().default(''),
    genre: text('genre').notNull().default('expository'),
    requestJson: text('request_json'),
    contentJson: text('content_json').notNull(),
    metricsJson: text('metrics_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('articles_created_idx').on(table.createdAt)],
)

export const articleTokens = sqliteTable(
  'article_tokens',
  {
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    surface: text('surface').notNull(),
    normalized: text('normalized').notNull(),
    lemma: text('lemma').notNull(),
    status: text('status').notNull(),
    paragraph: integer('paragraph').notNull(),
    sentenceIndex: integer('sentence_index').notNull(),
    startOffset: integer('start_offset').notNull(),
    endOffset: integer('end_offset').notNull(),
    knownResponse: text('known_response'),
    repeat: integer('repeat').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.articleId, table.idx] }),
    index('article_tokens_lemma_idx').on(table.lemma),
  ],
)

export const wordLookup = sqliteTable('word_lookup', {
  lemma: text('lemma').primaryKey(),
  payloadJson: text('payload_json').notNull(),
  fetchedAt: text('fetched_at').notNull(),
})

export const ttsCache = sqliteTable('tts_cache', {
  hash: text('hash').primaryKey(),
  path: text('path').notNull(),
  durationMs: integer('duration_ms').notNull().default(0),
  voice: text('voice').notNull(),
  provider: text('provider').notNull(),
  model: text('model'),
  text: text('text').notNull(),
  createdAt: text('created_at').notNull(),
})

export const additions = sqliteTable('additions', {
  lemma: text('lemma').primaryKey(),
  vocId: text('voc_id'),
  spelling: text('spelling').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  simulated: integer('simulated').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const ecdict = sqliteTable('ecdict', {
  word: text('word').primaryKey(),
  phonetic: text('phonetic'),
  translation: text('translation'),
  definition: text('definition'),
  pos: text('pos'),
  tag: text('tag'),
  frq: integer('frq'),
  bnc: integer('bnc'),
  oxford: integer('oxford'),
  collins: integer('collins'),
  exchange: text('exchange'),
  detail: text('detail'),
})

export const lemmaMap = sqliteTable('lemma_map', {
  surface: text('surface').primaryKey(),
  lemma: text('lemma').notNull(),
})

export const articleAudio = sqliteTable(
  'article_audio',
  {
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    voice: text('voice').notNull(),
    hash: text('hash'),
    durationMs: integer('duration_ms').notNull().default(0),
    status: text('status').notNull(),
    error: text('error'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.articleId, table.idx, table.voice] })],
)
