import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { VOICES, type VoiceId } from '@/lib/constants'
import { getAudioDir, getTtsEnv } from '@/lib/env'
import { getTtsCacheRow, insertTtsCache } from '@/lib/db/queries'
import { AzureTtsProvider } from './azure'
import { ElevenLabsTtsProvider } from './elevenlabs'
import { MockTtsProvider } from './mock'
import { OpenAiTtsProvider } from './openai'
import { TtsError, type TtsCacheResult, type TtsContext, type TtsProvider, type TtsResult, type TtsVoice } from './types'
import { WindowsSapiProvider } from './windows'
import { estimateDurationMs, wavDurationMs } from './wav'

export function getVoice(voiceId: string): TtsVoice {
  const found = VOICES.find((voice) => voice.id === voiceId)
  if (found) return { id: found.id, accent: found.accent, gender: found.gender }
  const fallback = VOICES[0]
  return { id: fallback.id, accent: fallback.accent, gender: fallback.gender }
}

function buildProvider(): { provider: TtsProvider; configured: boolean; local: boolean } {
  const env = getTtsEnv()
  switch (env.preferred) {
    case 'azure':
      if (env.azureKey) {
        return {
          provider: new AzureTtsProvider(env.azureKey, env.azureRegion),
          configured: true,
          local: false,
        }
      }
      break
    case 'elevenlabs':
      if (env.elevenLabsKey) {
        return {
          provider: new ElevenLabsTtsProvider(
            env.elevenLabsKey,
            env.elevenLabsModel,
            process.env.ELEVENLABS_VOICE_ID?.trim() || '21m00Tcm4TlvDq8ikWAM',
          ),
          configured: true,
          local: false,
        }
      }
      break
    case 'openai':
      if (env.openaiKey) {
        return {
          provider: new OpenAiTtsProvider(env.openaiKey, env.openAiModel),
          configured: true,
          local: false,
        }
      }
      break
    case 'local':
      if (WindowsSapiProvider.platformAvailable()) {
        return { provider: new WindowsSapiProvider(), configured: true, local: true }
      }
      break
    default:
      break
  }
  return { provider: new MockTtsProvider(), configured: false, local: false }
}

export function getTtsProviderInfo(): {
  provider: string
  configured: boolean
  local: boolean
  model: string | null
} {
  const { provider, configured, local } = buildProvider()
  return { provider: provider.id, configured, local, model: provider.model ?? null }
}

function hashKey(provider: TtsProvider, voice: TtsVoice, text: string): string {
  return createHash('sha256')
    .update(`${provider.id}|${provider.model ?? ''}|${voice.id}|${text}`)
    .digest('hex')
}

function finalize(
  hash: string,
  result: TtsResult,
  providerId: string,
  model: string | null,
  voice: TtsVoice,
  text: string,
): TtsCacheResult {
  const dir = getAudioDir()
  const file = path.join(dir, `${hash}.${result.ext}`)
  const tmp = path.join(dir, `${hash}.${randomUUID()}.tmp`)
  fs.writeFileSync(tmp, result.audio)
  fs.renameSync(tmp, file)
  const durationMs =
    result.durationMs ??
    (result.ext === 'wav' ? (wavDurationMs(result.audio) ?? estimateDurationMs(text)) : estimateDurationMs(text))
  insertTtsCache({
    hash,
    path: file,
    durationMs,
    voice: voice.id,
    provider: providerId,
    model,
    text,
  })
  return {
    hash,
    path: file,
    durationMs,
    provider: providerId,
    model,
    voice: voice.id,
    cacheHit: false,
  }
}

export async function synthesizeText(
  text: string,
  voiceId: string,
  context?: TtsContext,
): Promise<TtsCacheResult> {
  const clean = text.trim()
  if (!clean) throw new TtsError('待合成文本为空')
  const voice = getVoice(voiceId)
  let { provider, configured } = buildProvider()

  const firstHash = hashKey(provider, voice, clean)
  const cached = getTtsCacheRow(firstHash)
  if (cached && fs.existsSync(cached.path)) {
    return {
      hash: cached.hash,
      path: cached.path,
      durationMs: cached.durationMs,
      provider: cached.provider,
      model: cached.model,
      voice: voice.id,
      cacheHit: true,
    }
  }
  if (!configured) {
    // mock provider needs no key
  }

  let result: TtsResult
  try {
    result = await provider.synthesize(clean, voice, context)
  } catch (error) {
    if (provider.id === 'local-sapi') {
      console.warn(`[tts] local SAPI failed, using silent track: ${error instanceof Error ? error.message : error}`)
      provider = new MockTtsProvider()
      result = await provider.synthesize(clean, voice, context)
    } else {
      throw error instanceof TtsError
        ? error
        : new TtsError(`TTS 失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  const hash = hashKey(provider, voice, clean)
  const secondCached = getTtsCacheRow(hash)
  if (secondCached && fs.existsSync(secondCached.path)) {
    return {
      hash: secondCached.hash,
      path: secondCached.path,
      durationMs: secondCached.durationMs,
      provider: secondCached.provider,
      model: secondCached.model,
      voice: voice.id,
      cacheHit: true,
    }
  }
  return finalize(hash, result, provider.id, provider.model ?? null, voice, clean)
}

export async function synthesizeWord(word: string, voiceId: string): Promise<TtsCacheResult> {
  return synthesizeText(word, voiceId, { kind: 'word' })
}

export function getAudioRecord(hash: string): (TtsCacheResult & { text: string }) | null {
  const row = getTtsCacheRow(hash)
  if (!row) return null
  if (!fs.existsSync(row.path)) return null
  return {
    hash: row.hash,
    path: row.path,
    durationMs: row.durationMs,
    provider: row.provider,
    model: row.model,
    voice: row.voice as VoiceId,
    cacheHit: true,
    text: row.text,
  }
}

export function providerDisplayName(provider: string): string {
  switch (provider) {
    case 'azure':
      return 'Azure Speech'
    case 'elevenlabs':
      return 'ElevenLabs'
    case 'openai':
      return 'OpenAI TTS'
    case 'local-sapi':
      return 'Windows 本地朗读'
    default:
      return '静音占位音轨'
  }
}
