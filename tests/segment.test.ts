import { describe, expect, it } from 'vitest'
import {
  containsCjk,
  containsMarkdown,
  segmentSentences,
  tokenizeSentence,
} from '@/lib/text/segment'

describe('segmentSentences', () => {
  it('splits paragraphs and preserves offsets', () => {
    const result = segmentSentences(
      'The night shift begins. The city sleeps.\n\nA kettle clicks off. Someone laughs.',
    )
    expect(result.paragraphCount).toBe(2)
    expect(result.sentences).toHaveLength(4)
    expect(result.sentences[0].p).toBe(1)
    expect(result.sentences[2].p).toBe(2)
    for (const sentence of result.sentences) {
      expect(result.text.slice(sentence.start, sentence.end)).toBe(sentence.text)
    }
  })

  it('normalizes curly quotes and hyphenated line breaks', () => {
    const result = segmentSentences('It was well-\nknown. “Really?” she said. It stopped.')
    // 跨行断词：删除连字符并拼回单词
    expect(result.text).toContain('wellknown')
    expect(result.text).toContain('"Really?"')
    expect(result.sentences.length).toBeGreaterThanOrEqual(3)
  })

  it('returns nothing for empty text', () => {
    expect(segmentSentences('   ').sentences).toHaveLength(0)
  })
})

describe('tokenizeSentence', () => {
  it('keeps contractions and possessives together', () => {
    const tokens = tokenizeSentence("The nurses' notes were world's best. Don't touch it's.")
    const surfaces = tokens.map((token) => token.surface)
    expect(surfaces).toContain("nurses'")
    expect(surfaces).toContain("world's")
    expect(surfaces).toContain("Don't")
    expect(surfaces).toContain("it's")
  })

  it('merges hyphenated compounds and records parts', () => {
    const tokens = tokenizeSentence('A well-known state-of-the-art design.')
    const compound = tokens.find((token) => token.surface === 'well-known')
    expect(compound).toBeTruthy()
    expect(compound?.parts?.map((part) => part.surface)).toEqual(['well', 'known'])
    const long = tokens.find((token) => token.surface === 'state-of-the-art')
    expect(long?.parts).toHaveLength(4)
  })

  it('skips URLs, emails, numbers, and code', () => {
    const tokens = tokenizeSentence('Mail me at a@b.com or see https://x.dev/abc in 2026.')
    const surfaces = tokens.map((token) => token.surface)
    expect(surfaces).not.toContain('a@b.com')
    expect(surfaces.some((surface) => surface.includes('2026'))).toBe(false)
    expect(surfaces).not.toContain('https')
  })
})

describe('content guards', () => {
  it('detects Chinese and Markdown', () => {
    expect(containsCjk('这是中文')).toBe(true)
    expect(containsCjk('plain English')).toBe(false)
    expect(containsMarkdown('## Title')).toBe(true)
    expect(containsMarkdown('A **bold** word')).toBe(true)
    expect(containsMarkdown('a - b')).toBe(false)
  })
})
