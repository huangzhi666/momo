import type { Genre, Level, OxfordMode, VoiceId } from './constants'

export type TokenStatus = 'ignored' | 'proper' | 'basic' | 'known' | 'new' | 'out_of_band'

export interface TokenRecord {
  idx: number
  start: number
  end: number
  surface: string
  normalized: string
  lemma: string
  status: TokenStatus
  sentenceIndex: number
  paragraph: number
  knownResponse?: string | null
  repeat?: boolean
}

export interface SentenceRecord {
  index: number
  p: number
  text: string
  start: number
  end: number
}

export interface SentenceWithTokens extends SentenceRecord {
  tokens: TokenRecord[]
  audio?: {
    hash: string
    url: string
    durationMs: number
    status: 'ready' | 'pending' | 'failed'
  }
}

export interface ArticleMetrics {
  wordCount: number
  sentenceCount: number
  paragraphCount: number
  avgSentenceLength: number
  maxSentenceLength: number
  basicCount: number
  knownCount: number
  newCount: number
  outOfBandCount: number
  properCount: number
  newTokenCount: number
  outOfBandTokenCount: number
  newDensity: number
  outOfBandDensity: number
  basicCoverage: number
  targetCount: number
  targetUsed: string[]
  targetCoverage: number
  estimatedReadingMinutes: number
  newLemmas: string[]
  outOfBandLemmas: string[]
  sentenceWordCounts: number[]
}

export interface GeneratedArticle {
  title: string
  topic: string
  genre: Genre
  sentences: { p: number; text: string }[]
  targets_used: string[]
  summary_zh: string
}

export interface ArticleRequest {
  level: Level
  length: number
  newWords: number
  topic: string
  genre: Genre | 'random'
  targets: string[]
  supplement: string
  voice: VoiceId
  seed?: number
  model?: string
  generatedWith?: string
  warnings?: string[]
}

export interface ArticleContent {
  text: string
  sentences: SentenceRecord[]
  metrics: ArticleMetrics
  summaryZh: string
  targets: string[]
  demo?: boolean
}

export type ArticleKind = 'generated' | 'imported' | 'demo'

export interface ArticleRowDTO {
  id: string
  title: string
  kind: ArticleKind
  level: Level
  topic: string
  genre: Genre | 'imported'
  createdAt: string
  metrics: ArticleMetrics
  request: ArticleRequest | null
  summaryZh: string
  demo: boolean
  sentences: SentenceWithTokens[]
  sentenceCount: number
  audio: ArticleAudioState
  wordMeta: WordMeta[]
}

export interface WordMeta {
  lemma: string
  surface: string
  status: Extract<TokenStatus, 'new' | 'out_of_band'>
  count: number
  firstSentenceIndex: number
  firstSentenceText: string
  band: boolean
  frq: number | null
  translation: string | null
  phonetic: string | null
}

export interface ArticleAudioState {
  voice: VoiceId
  total: number
  ready: number
  failed: number
  status: 'idle' | 'running' | 'done' | 'partial'
  provider: string
}

export interface AudioSentence {
  index: number
  hash: string
  url: string
  durationMs: number
  status: 'ready' | 'pending' | 'failed'
}

export interface VoiceOption {
  id: VoiceId
  accent: 'us' | 'uk'
  gender: 'female' | 'male'
}

export interface WordCardData {
  lemma: string
  surface: string
  phonetic: string | null
  translation: string | null
  definition: string | null
  pos: string | null
  tags: string[]
  oxford: boolean
  collins: number | null
  frq: number | null
  forms: { label: string; value: string }[]
  status: TokenStatus
  knownResponse: string | null
  inVocab: boolean
  inMaimemo: boolean | null
  example: { text: string; translation?: string; ai: boolean } | null
  aiExamples: { text: string; translation?: string }[]
  originalSentence: string | null
  personal: {
    interpretations: string[]
    phrases: string[]
    notes: string[]
  } | null
  canAdd: boolean
  additionStatus: 'none' | 'pending' | 'synced' | 'failed'
  demo: boolean
}

export interface AppStatus {
  demo: boolean
  demoReason: string
  ecdictReady: boolean
  ecdictWords: number
  vocabCount: number
  vocabSource: 'maimemo' | 'demo' | 'mixed' | 'empty'
  lastSyncAt: string | null
  syncRunning: boolean
  llm: { configured: boolean; model: string | null; baseUrlHost: string | null }
  tts: { provider: string; configured: boolean; local: boolean }
  maimemo: { configured: boolean; tokenPreview: string | null }
  oxfordMode: OxfordMode
  dataDir: string
}
