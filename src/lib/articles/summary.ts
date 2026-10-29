import type { ArticleMetrics } from '@/lib/types'

export interface ArticleSummaryDTO {
  id: string
  title: string
  kind: string
  level: string
  topic: string
  genre: string
  createdAt: string
  wordCount: number
  newCount: number
  outOfBandCount: number
  summaryZh: string
  demo: boolean
  preview: string
}

export function buildSummaryDTO(row: {
  id: string
  title: string
  kind: string
  level: string
  topic: string
  genre: string
  createdAt: string
  contentJson: string
  metricsJson: string
}): ArticleSummaryDTO {
  let metrics: Partial<ArticleMetrics> = {}
  let summaryZh = ''
  let preview = ''
  let demo = row.kind === 'demo'
  try {
    metrics = JSON.parse(row.metricsJson) as Partial<ArticleMetrics>
  } catch {
    metrics = {}
  }
  try {
    const content = JSON.parse(row.contentJson) as {
      text?: string
      summaryZh?: string
      demo?: boolean
      sentences?: { text: string }[]
    }
    summaryZh = content.summaryZh ?? ''
    preview = content.sentences?.[0]?.text ?? content.text?.slice(0, 120) ?? ''
    demo = demo || Boolean(content.demo)
  } catch {
    // ignore
  }
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    level: row.level,
    topic: row.topic,
    genre: row.genre,
    createdAt: row.createdAt,
    wordCount: metrics.wordCount ?? 0,
    newCount: metrics.newCount ?? 0,
    outOfBandCount: metrics.outOfBandCount ?? 0,
    summaryZh,
    demo,
    preview,
  }
}
