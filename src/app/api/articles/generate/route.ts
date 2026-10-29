import { z } from 'zod'
import { GENRES, LENGTHS, LEVELS, VOICES, type VoiceId } from '@/lib/constants'
import { jsonError, jsonOk, readJson } from '@/lib/api'
import { generateArticle } from '@/lib/generation/service'
import { maybeRefreshVocab } from '@/lib/maimemo/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const schema = z.object({
  level: z.enum(LEVELS),
  length: z.number().int().refine((value) => (LENGTHS as readonly number[]).includes(value)),
  newWords: z.number().int().min(10).max(100),
  topic: z.string().max(120).optional(),
  genre: z.enum([...GENRES, 'random']).optional(),
  supplement: z.string().max(300).optional(),
  voice: z
    .string()
    .refine((value) => VOICES.some((voice) => voice.id === value))
    .optional(),
  seed: z.number().int().min(1).max(0xffffffff).optional(),
})

export async function POST(request: Request) {
  try {
    const input = schema.parse(await readJson(request))
    maybeRefreshVocab()
    const result = await generateArticle({
      ...input,
      voice: input.voice as VoiceId | undefined,
    })
    return jsonOk(result)
  } catch (error) {
    return jsonError(error)
  }
}
