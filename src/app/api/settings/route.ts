import { z } from 'zod'
import { LENGTHS, LEVELS, OXFORD_MODES, VOICES } from '@/lib/constants'
import { getAppSettings, updateAppSettings } from '@/lib/settings'
import { jsonError, jsonOk, readJson } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z
  .object({
    level: z.enum(LEVELS),
    length: z.number().int().refine((value) => (LENGTHS as readonly number[]).includes(value)),
    newWords: z.number().int().min(10).max(100),
    voice: z.string().refine((value) => VOICES.some((voice) => voice.id === value)),
    oxfordMode: z.enum(OXFORD_MODES),
    showForgetUnderline: z.boolean(),
    gapFactor: z.number().min(0.5).max(2),
    playbackRate: z.number().min(0.5).max(1.5),
  })
  .partial()

export async function GET() {
  try {
    return jsonOk({ settings: getAppSettings() })
  } catch (error) {
    return jsonError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const body = patchSchema.parse(await readJson(request))
    const settings = updateAppSettings(body)
    return jsonOk({ settings })
  } catch (error) {
    return jsonError(error)
  }
}
