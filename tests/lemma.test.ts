import { describe, expect, it } from 'vitest'
import { resolveLemmaWith, type LemmaDeps } from '@/lib/text/lemma'

const mapping: Record<string, string> = Object.assign(Object.create(null), {
  running: 'run',
  studies: 'study',
  nurses: 'nurse',
  faster: 'fast',
  bigger: 'big',
})

const words = new Set([
  'run',
  'study',
  'nurse',
  'fast',
  'big',
  'teach',
  'corn',
  'spann',
  'lev',
  'hat',
  'hate',
  'see',
  'sh',
  'the',
  'thing',
  'morning',
  'evening',
  'building',
])

const deps: LemmaDeps = {
  lookupMap: (surface) => mapping[surface],
  exists: (word) => words.has(word),
  posOf: () => null,
  isBasicHeadword: (word) =>
    ['teacher', 'corner', 'thing', 'morning', 'evening', 'building'].includes(word),
}

describe('resolveLemmaWith — inflection only', () => {
  it('lemmatizes regular inflection through the map', () => {
    expect(resolveLemmaWith('running', deps)).toBe('run')
    expect(resolveLemmaWith('studies', deps)).toBe('study')
    expect(resolveLemmaWith("nurses'", deps)).toBe('nurse')
    expect(resolveLemmaWith('faster', deps)).toBe('fast')
  })

  it('handles irregular forms and contractions', () => {
    expect(resolveLemmaWith('went', deps)).toBe('go')
    expect(resolveLemmaWith('better', deps)).toBe('good')
    expect(resolveLemmaWith('best', deps)).toBe('good')
    expect(resolveLemmaWith('was', deps)).toBe('be')
    expect(resolveLemmaWith("don't", deps)).toBe('do')
    expect(resolveLemmaWith("it's", deps)).toBe('it')
    expect(resolveLemmaWith("I'm", deps)).toBe('i')
    expect(resolveLemmaWith("can't", deps)).toBe('can')
    expect(resolveLemmaWith("world's", deps)).toBe('world')
  })

  it('never derives happiness → happy', () => {
    expect(resolveLemmaWith('happiness', deps)).toBe('happiness')
    expect(resolveLemmaWith('unhappiness', deps)).toBe('unhappiness')
    expect(resolveLemmaWith('teacher', deps)).toBe('teacher')
  })

  it('does not strip -er nouns or basic headwords', () => {
    expect(resolveLemmaWith('corner', deps)).toBe('corner')
    expect(resolveLemmaWith('spanner', deps)).toBe('spanner')
    expect(resolveLemmaWith('lever', deps)).toBe('lever')
    expect(resolveLemmaWith('thing', deps)).toBe('thing')
  })

  it('protects lexicalized plurals and -ics words', () => {
    expect(resolveLemmaWith('species', deps)).toBe('species')
    expect(resolveLemmaWith('series', deps)).toBe('series')
    expect(resolveLemmaWith('physics', deps)).toBe('physics')
    expect(resolveLemmaWith('clothes', deps)).toBe('clothes')
  })

  it('returns function words unchanged', () => {
    expect(resolveLemmaWith('as', deps)).toBe('as')
    expect(resolveLemmaWith('this', deps)).toBe('this')
  })

  it('never resolves Object.prototype keys to functions', () => {
    // 真实同步时发现：CONTRACTIONS['constructor'] 会返回 Object 构造函数，
    // 导致 SQLite 绑定函数而报错。
    expect(resolveLemmaWith('constructor', deps)).toBe('constructor')
    expect(resolveLemmaWith('toString', deps)).toBe('tostring')
    expect(resolveLemmaWith('hasOwnProperty', deps)).toBe('hasownproperty')
    expect(resolveLemmaWith('valueOf', deps)).toBe('valueof')
  })
})
