import { z } from 'zod'
import { GENRES } from '@/lib/constants'

export const generatedArticleSchema = z.object({
  title: z.string().min(1).max(120),
  topic: z.string().min(1).max(160),
  genre: z.enum(GENRES),
  sentences: z
    .array(
      z.object({
        p: z.number().int().min(1).max(12),
        text: z.string().min(1).max(500),
      }),
    )
    .min(8)
    .max(30),
  targets_used: z.array(z.string()).max(40),
  summary_zh: z.string().min(1).max(240),
})

export type GeneratedArticleObject = z.infer<typeof generatedArticleSchema>

export const wordExamplesSchema = z.object({
  examples: z
    .array(
      z.object({
        text: z.string().min(3).max(220),
        translation: z.string().min(1).max(220),
      }),
    )
    .min(1)
    .max(2),
})

export type WordExamplesObject = z.infer<typeof wordExamplesSchema>
