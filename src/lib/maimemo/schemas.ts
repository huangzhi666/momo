import { z } from 'zod'

const dateLike = z.union([z.string(), z.null()]).nullish()
const tagLike = z.union([z.string(), z.array(z.string())]).nullish()

export const studyRecordSchema = z
  .object({
    voc_id: z.string(),
    voc_spelling: z.string(),
    add_date: dateLike,
    first_study_date: dateLike,
    last_study_date: dateLike,
    next_study_date: dateLike,
    last_response: z.string().nullish(),
    study_count: z.coerce.number().int().catch(0).nullish(),
    tags: tagLike,
  })
  .passthrough()

export const studyRecordsPayloadSchema = z
  .object({
    records: z.array(studyRecordSchema).optional(),
    count: z.coerce.number().optional(),
  })
  .passthrough()

export const vocItemSchema = z
  .object({
    id: z.string(),
    spelling: z.string(),
  })
  .passthrough()

export const vocPayloadSchema = z
  .object({
    voc: z.union([z.array(vocItemSchema), vocItemSchema]).optional(),
    records: z.array(vocItemSchema).optional(),
  })
  .passthrough()

export const addWordsPayloadSchema = z
  .object({
    added_count: z.coerce.number().int(),
  })
  .passthrough()

export const progressPayloadSchema = z
  .object({
    progress: z
      .object({
        finished: z.number().optional(),
        total: z.number().optional(),
        study_time: z.number().optional(),
      })
      .optional(),
  })
  .passthrough()

export interface MaimemoStudyRecord {
  vocId: string
  spelling: string
  addDate: string | null
  firstStudyDate: string | null
  lastStudyDate: string | null
  nextStudyDate: string | null
  lastResponse: string | null
  studyCount: number
  tags: string[]
}

export function normalizeTags(tags: string | string[] | null | undefined): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) return tags.map(String)
  return [String(tags)]
}

export function normalizeRecord(raw: unknown): MaimemoStudyRecord | null {
  const parsed = studyRecordSchema.safeParse(raw)
  if (!parsed.success) return null
  const record = parsed.data
  return {
    vocId: record.voc_id,
    spelling: record.voc_spelling,
    addDate: record.add_date ?? null,
    firstStudyDate: record.first_study_date ?? null,
    lastStudyDate: record.last_study_date ?? null,
    nextStudyDate: record.next_study_date ?? null,
    lastResponse: record.last_response ?? null,
    studyCount: record.study_count ?? 0,
    tags: normalizeTags(record.tags),
  }
}
