/* eslint-disable no-console */
import { deleteArticleRow, listArticleRows } from '@/lib/db/queries'
import { persistArticle } from '@/lib/articles/service'
import { analyzeText } from '@/lib/text/analyze'
import { prepareArticleAudio } from '@/lib/tts/job'
import { getDefaultVoice } from '@/lib/settings'
import type { ArticleRequest } from '@/lib/types'
import { DEMO_ARTICLES } from './articles'
import { ensureDemoVocab, seedDemoVocab } from './vocab'

export interface SeedDemoOptions {
  force?: boolean
  audio?: boolean
  voice?: string
  resetVocab?: boolean
}

export interface SeedDemoResult {
  vocabCount: number
  articleIds: string[]
  audio: { articleId: string; ready: number; failed: number; total: number }[]
}

export async function seedDemoContent(options: SeedDemoOptions = {}): Promise<SeedDemoResult> {
  const voice = options.voice || getDefaultVoice()
  const vocabCount = options.resetVocab ? seedDemoVocab(true) : ensureDemoVocab()
  const existing = listArticleRows(200, 'demo')
  const existingFor = (title: string) => existing.filter((row) => row.title === title)
  const articleIds: string[] = []
  const audio: SeedDemoResult['audio'] = []

  for (const demo of DEMO_ARTICLES) {
    const matches = existingFor(demo.title)
    const current = matches[0]
    if (current && !options.force) {
      articleIds.push(current.id)
      if (options.audio) {
        const state = await prepareArticleAudio(current.id, voice)
        audio.push({
          articleId: current.id,
          ready: state.done,
          failed: state.failed,
          total: state.total,
        })
      }
      continue
    }
    if (options.force) {
      for (const row of matches) deleteArticleRow(row.id)
    }

    const firstPass = analyzeText(demo.text, { level: demo.level })
    const targetSet: string[] = []
    for (const token of firstPass.tokens) {
      if (token.status !== 'known') continue
      if (!targetSet.includes(token.lemma)) targetSet.push(token.lemma)
      if (targetSet.length >= 12) break
    }
    const analysis = analyzeText(demo.text, { level: demo.level, targets: targetSet })
    const request: ArticleRequest = {
      level: demo.level,
      length: analysis.metrics.wordCount,
      newWords: Math.max(10, Math.min(100, analysis.metrics.newCount)),
      topic: demo.topic,
      genre: demo.genre,
      targets: targetSet,
      supplement: '',
      voice: voice as ArticleRequest['voice'],
      generatedWith: 'demo-seed',
      warnings: [],
    }
    const id = persistArticle({
      title: demo.title,
      kind: 'demo',
      level: demo.level,
      topic: demo.topic,
      genre: demo.genre,
      request,
      analysis,
      summaryZh: demo.summaryZh,
      demo: true,
    })
    articleIds.push(id)
    if (options.audio) {
      const state = await prepareArticleAudio(id, voice)
      audio.push({ articleId: id, ready: state.done, failed: state.failed, total: state.total })
    }
  }

  return { vocabCount, articleIds, audio }
}
