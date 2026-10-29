import { z } from 'zod'
import {
  DEFAULT_SETTINGS,
  LENGTHS,
  LEVELS,
  OXFORD_MODES,
  type ArticleLength,
  type Level,
  type OxfordMode,
  type VoiceId,
  VOICES,
} from '@/lib/constants'
import { getJsonSetting, setJsonSetting } from '@/lib/db/queries'

const settingsSchema = z.object({
  level: z.enum(LEVELS).catch(DEFAULT_SETTINGS.level),
  length: z
    .number()
    .int()
    .refine((value) => (LENGTHS as readonly number[]).includes(value), 'unsupported length')
    .catch(DEFAULT_SETTINGS.length),
  newWords: z.number().int().min(10).max(100).catch(DEFAULT_SETTINGS.newWords),
  voice: z.string().catch(DEFAULT_SETTINGS.voice),
  oxfordMode: z.enum(OXFORD_MODES).catch(DEFAULT_SETTINGS.oxfordMode),
  showForgetUnderline: z.boolean().catch(DEFAULT_SETTINGS.showForgetUnderline),
  gapFactor: z.number().min(0.5).max(2).catch(DEFAULT_SETTINGS.gapFactor),
  playbackRate: z.number().min(0.5).max(1.5).catch(DEFAULT_SETTINGS.playbackRate),
})

export type AppSettings = z.infer<typeof settingsSchema>

export function getAppSettings(): AppSettings {
  const raw = getJsonSetting<Partial<AppSettings>>('app_settings', {})
  const envVoice = process.env.DEFAULT_VOICE?.trim()
  const merged = settingsSchema.parse({
    ...DEFAULT_SETTINGS,
    ...(envVoice && VOICES.some((voice) => voice.id === envVoice) ? { voice: envVoice } : {}),
    ...raw,
  })
  return merged
}

export function updateAppSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getAppSettings()
  const next = settingsSchema.parse({ ...current, ...patch })
  setJsonSetting('app_settings', next)
  return next
}

export function getDefaultLevel(): Level {
  return getAppSettings().level
}

export function getDefaultVoice(): VoiceId {
  return getAppSettings().voice as VoiceId
}

export function getDefaultLength(): ArticleLength {
  return getAppSettings().length as ArticleLength
}

export function getDefaultOxfordMode(): OxfordMode {
  return getAppSettings().oxfordMode
}
