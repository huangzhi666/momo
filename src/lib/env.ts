import path from 'node:path'
import fs from 'node:fs'

export function getDataDir(): string {
  const dir = process.env.LEXILOOP_DATA_DIR
    ? path.resolve(process.env.LEXILOOP_DATA_DIR)
    : path.join(process.cwd(), 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getAudioDir(): string {
  const dir = path.join(getDataDir(), 'audio')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getDbPath(): string {
  if (process.env.LEXILOOP_DB) return process.env.LEXILOOP_DB
  return path.join(getDataDir(), 'lexiloop.db')
}

export function getBasicDir(): string {
  return path.join(getDataDir(), 'basic')
}

export function getMaimemoToken(): string | null {
  const token = process.env.MAIMEMO_API_TOKEN?.trim()
  return token ? token : null
}

export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true') return true
  return !getMaimemoToken()
}

export function demoReason(): string {
  if (process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true') {
    return 'DEMO_MODE 已开启'
  }
  if (getMaimemoToken()) return '已配置墨墨 Token，Demo 模式关闭'
  return '未配置 MAIMEMO_API_TOKEN'
}

export interface LlmConfig {
  apiKey: string | null
  baseUrl: string
  model: string
  configured: boolean
}

export function getLlmConfig(): LlmConfig {
  const apiKey = process.env.LLM_API_KEY?.trim() || null
  const baseUrl = process.env.LLM_BASE_URL?.trim() || 'https://api.deepseek.com/v1'
  const model = process.env.LLM_MODEL?.trim() || 'deepseek-chat'
  return { apiKey, baseUrl, model, configured: Boolean(apiKey) }
}

export interface TtsEnvConfig {
  preferred: 'azure' | 'elevenlabs' | 'openai' | 'local' | 'mock'
  azureKey: string | null
  azureRegion: string
  elevenLabsKey: string | null
  elevenLabsModel: string
  openaiKey: string | null
  openAiModel: string
}

export function getTtsEnv(): TtsEnvConfig {
  const requested = process.env.TTS_PROVIDER?.trim().toLowerCase()
  const azureKey = process.env.AZURE_SPEECH_KEY?.trim() || null
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY?.trim() || null
  const openaiKey = process.env.OPENAI_TTS_API_KEY?.trim() || null

  let preferred: TtsEnvConfig['preferred'] = 'mock'
  if (requested === 'azure' && azureKey) preferred = 'azure'
  else if (requested === 'elevenlabs' && elevenLabsKey) preferred = 'elevenlabs'
  else if (requested === 'openai' && openaiKey) preferred = 'openai'
  else if (requested === 'local') preferred = 'local'
  else if (requested === 'mock') preferred = 'mock'
  else if (azureKey) preferred = 'azure'
  else if (elevenLabsKey) preferred = 'elevenlabs'
  else if (openaiKey) preferred = 'openai'
  else preferred = 'local'

  return {
    preferred,
    azureKey,
    azureRegion: process.env.AZURE_SPEECH_REGION?.trim() || 'eastus',
    elevenLabsKey,
    elevenLabsModel: process.env.ELEVENLABS_MODEL?.trim() || 'eleven_multilingual_v2',
    openaiKey,
    openAiModel: process.env.OPENAI_TTS_MODEL?.trim() || 'gpt-4o-mini-tts',
  }
}
