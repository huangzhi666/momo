import type { VoiceId } from '@/lib/constants'

export interface TtsVoice {
  id: VoiceId
  accent: 'us' | 'uk'
  gender: 'female' | 'male'
}

export interface TtsContext {
  previousText?: string
  nextText?: string
  kind?: 'sentence' | 'word'
}

export interface TtsResult {
  audio: Buffer
  ext: 'mp3' | 'wav'
  durationMs?: number
  model?: string
}

export interface TtsProvider {
  id: string
  model?: string
  synthesize(text: string, voice: TtsVoice, context?: TtsContext): Promise<TtsResult>
}

export interface TtsCacheResult {
  hash: string
  path: string
  durationMs: number
  provider: string
  model: string | null
  voice: VoiceId
  cacheHit: boolean
}

export class TtsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TtsError'
  }
}
