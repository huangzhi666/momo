import { describe, expect, it } from 'vitest'
import type { ArticleMetrics } from '@/lib/types'
import { validateArticle } from '@/lib/generation/validate'

function metrics(overrides: Partial<ArticleMetrics> = {}): ArticleMetrics {
  return {
    wordCount: 320,
    sentenceCount: 18,
    paragraphCount: 3,
    avgSentenceLength: 17.8,
    maxSentenceLength: 26,
    basicCount: 250,
    knownCount: 30,
    newCount: 12,
    outOfBandCount: 2,
    properCount: 0,
    newTokenCount: 15,
    outOfBandTokenCount: 2,
    newDensity: 15 / 320,
    outOfBandDensity: 2 / 320,
    basicCoverage: 250 / 320,
    targetCount: 12,
    targetUsed: ['shift', 'kettle', 'corridor', 'mop', 'nurse', 'pharmacy', 'drizzle', 'monitor'],
    targetCoverage: 8 / 12,
    estimatedReadingMinutes: 1.5,
    newLemmas: ['kettle', 'corridor'],
    outOfBandLemmas: ['zephyr'],
    sentenceWordCounts: new Array(18).fill(18),
    ...overrides,
  }
}

const base = {
  title: 'Four O’Clock in the Corridor',
  text: 'The night shift begins long before the city sleeps. Nothing else is written here.',
  length: 320,
  newTarget: 12,
  targets: ['shift', 'kettle', 'corridor', 'mop', 'nurse', 'pharmacy', 'drizzle', 'monitor'],
}

describe('validateArticle', () => {
  it('accepts a within-budget article', () => {
    const result = validateArticle({ ...base, metrics: metrics() })
    expect(result.acceptable).toBe(true)
    expect(result.blocking).toHaveLength(0)
  })

  it('blocks too many new words', () => {
    const result = validateArticle({
      ...base,
      metrics: metrics({ newCount: 20, newTokenCount: 24, newDensity: 24 / 320 }),
    })
    expect(result.acceptable).toBe(false)
    expect(result.blocking.map((check) => check.key)).toContain('new_count')
  })

  it('blocks out-of-band words over 4', () => {
    const result = validateArticle({
      ...base,
      metrics: metrics({ outOfBandCount: 5, outOfBandTokenCount: 7 }),
    })
    expect(result.blocking.map((check) => check.key)).toContain('out_of_band')
  })

  it('blocks too few new words', () => {
    const result = validateArticle({
      ...base,
      metrics: metrics({ newCount: 4, newTokenCount: 5, newDensity: 5 / 320 }),
    })
    expect(result.acceptable).toBe(false)
    expect(result.blocking.map((check) => check.key)).toContain('new_count_lower')
  })

  it('blocks low target coverage', () => {
    const result = validateArticle({
      ...base,
      metrics: metrics({ targetCoverage: 0.4, targetUsed: ['shift', 'kettle', 'corridor', 'mop'] }),
    })
    expect(result.blocking.map((check) => check.key)).toContain('target_coverage')
    expect(result.repairFocus.missingTargets.length).toBe(4)
  })

  it('blocks Chinese, Markdown, parentheses, and bad titles', () => {
    const result = validateArticle({
      ...base,
      title: 'A Story About A Nurse',
      text: 'The nurse (really) writes **中文**.',
      metrics: metrics(),
    })
    const keys = result.blocking.map((check) => check.key)
    expect(keys).toContain('no_cjk')
    expect(keys).toContain('no_markdown')
    expect(keys).toContain('no_parentheses')
    expect(keys).toContain('title')
  })

  it('treats word-count and sentence-length deviations as warnings', () => {
    const result = validateArticle({
      ...base,
      metrics: metrics({ wordCount: 200, sentenceCount: 10, avgSentenceLength: 20, maxSentenceLength: 40 }),
    })
    expect(result.acceptable).toBe(true)
    expect(result.warnings.map((check) => check.key)).toEqual(
      expect.arrayContaining(['word_count', 'sentence_count', 'max_sentence']),
    )
  })
})
