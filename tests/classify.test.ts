import { describe, expect, it } from 'vitest'
import type { EcdictEntry } from '@/lib/dict/ecdict'
import { getOxfordLevel, isFunctionWord, isProperNounWord, spellingVariants } from '@/lib/dict/basic'
import { analyzeText } from '@/lib/text/analyze'
import { classifyWord, type ClassifyDeps } from '@/lib/text/classify'

function entry(partial: Partial<EcdictEntry> & { word: string }): EcdictEntry {
  return {
    phonetic: null,
    translation: null,
    definition: null,
    pos: null,
    tag: null,
    frq: 5000,
    bnc: null,
    oxford: 0,
    collins: null,
    exchange: null,
    detail: null,
    ...partial,
  }
}

const entries = new Map<string, EcdictEntry>(
  [
    entry({ word: 'abandon', oxford: 1, tag: 'gk cet4' }),
    entry({ word: 'absorb', oxford: 1, tag: 'gk' }),
    entry({ word: 'kettle', oxford: 0, tag: 'gk cet4' }),
    entry({ word: 'puncture', oxford: 0, tag: 'ielts toefl' }),
    entry({ word: 'zephyr', oxford: 0, tag: 'gre' }),
    entry({ word: 'know', oxford: 1, tag: 'gk' }),
  ].map((item) => [item.word, item]),
)

const vocab = new Map([
  ['know', { lastResponse: 'FORGET', tags: [] }],
  ['puncture', { lastResponse: 'VAGUE', tags: ['STICKING'] }],
])

function deps(overrides: Partial<ClassifyDeps> = {}): ClassifyDeps {
  return {
    level: 'gaokao',
    oxfordMode: 'oxford3000',
    vocab,
    resolveLemma: (surface) => {
      const lower = surface.toLowerCase()
      if (lower === 'was' || lower === 'is') return 'be'
      if (lower === 'better') return 'good'
      if (lower === 'running') return 'run'
      return lower
    },
    lemmaCandidates: (surface) => [surface.toLowerCase()],
    getEntry: (word) => entries.get(word.toLowerCase()) ?? null,
    isFunctionWord,
    isProperNounWord,
    getOxfordLevel,
    spellingVariants,
    ...overrides,
  }
}

describe('classifyWord — Oxford first', () => {
  it('never marks Oxford 3000 words, even if not in vocab', () => {
    expect(classifyWord({ surface: 'abandon', sentenceInitial: false }, deps()).status).toBe(
      'basic',
    )
    expect(classifyWord({ surface: 'Abandon', sentenceInitial: true }, deps()).status).toBe(
      'basic',
    )
  })

  it('marks basic function words', () => {
    for (const word of ['a', 'an', 'the', 'it', 'of', 'to']) {
      expect(classifyWord({ surface: word, sentenceInitial: false }, deps()).status).toBe(
        'basic',
      )
    }
  })

  it('marks in-band non-basic words as new', () => {
    expect(classifyWord({ surface: 'kettle', sentenceInitial: false }, deps()).status).toBe('new')
  })

  it('marks out-of-band words separately', () => {
    expect(classifyWord({ surface: 'zephyr', sentenceInitial: false }, deps()).status).toBe(
      'out_of_band',
    )
    expect(
      classifyWord({ surface: 'puncture', sentenceInitial: false }, deps()).status,
    ).toBe('known')
    expect(
      classifyWord(
        { surface: 'puncture', sentenceInitial: false },
        deps({ level: 'ielts', vocab: new Map() }),
      ).status,
    ).toBe('new')
  })

  it('prefers basic over vocab', () => {
    expect(
      classifyWord(
        { surface: 'abandon', sentenceInitial: false },
        deps({ vocab: new Map([['abandon', { lastResponse: 'FORGET', tags: [] }]]) }),
      ).status,
    ).toBe('basic')
  })

  it('handles proper nouns only when capitalized mid-sentence', () => {
    expect(classifyWord({ surface: 'Kettle', sentenceInitial: false }, deps()).status).toBe(
      'proper',
    )
    expect(classifyWord({ surface: 'Kettle', sentenceInitial: true }, deps()).status).toBe('new')
    expect(classifyWord({ surface: 'NASA', sentenceInitial: true }, deps()).status).toBe('proper')
    expect(classifyWord({ surface: 'I', sentenceInitial: false }, deps()).status).toBe('basic')
  })

  it('respects Oxford mode off', () => {
    const off = deps({ oxfordMode: 'off' })
    expect(classifyWord({ surface: 'abandon', sentenceInitial: false }, off).status).toBe('new')
    expect(classifyWord({ surface: 'the', sentenceInitial: false }, off).status).toBe('basic')
  })
})

describe('analyzeText — acceptance', () => {
  it('marks nothing in a text of function words', () => {
    const result = analyzeText('a an the it is of to', { level: 'gaokao', deps: deps() })
    expect(result.metrics.newCount).toBe(0)
    expect(result.metrics.outOfBandCount).toBe(0)
    expect(result.tokens.every((token) => token.status === 'basic')).toBe(true)
    expect(result.tokens.find((token) => token.surface === 'is')?.lemma).toBe('be')
  })

  it('leaves Oxford words unmarked even outside the vocab', () => {
    const result = analyzeText('Abandon absorb the habit.', { level: 'gaokao', deps: deps() })
    expect(result.metrics.newCount).toBe(0)
    expect(result.tokens.filter((token) => token.surface.toLowerCase() === 'abandon')[0].status).toBe(
      'basic',
    )
  })

  it('counts distinct new lemmas and density', () => {
    const result = analyzeText('Kettle, kettle, kettle, zephyr.', {
      level: 'gaokao',
      deps: deps(),
    })
    expect(result.metrics.newCount).toBe(1)
    expect(result.metrics.newTokenCount).toBe(3)
    expect(result.metrics.outOfBandCount).toBe(1)
    expect(result.metrics.newDensity).toBeCloseTo(0.75)
    expect(result.tokens.filter((token) => token.lemma === 'kettle')[0].repeat).toBe(false)
    expect(result.tokens.filter((token) => token.lemma === 'kettle')[1].repeat).toBe(true)
  })
})
