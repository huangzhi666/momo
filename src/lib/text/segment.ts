import type { SentenceRecord } from '@/lib/types'
import { prepareText } from './clean'

export interface RawToken {
  start: number
  end: number
  surface: string
  parts?: { start: number; end: number; surface: string }[]
}

const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' })

const IGNORED_PATTERNS: RegExp[] = [
  /https?:\/\/[^\s)]+/gi,
  /\bwww\.[^\s)]+/gi,
  /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gi,
  /`[^`]*`/g,
  /\b[\w-]+\.(?:com|org|net|io|cn|dev|app|ai)\b/gi,
]

function ignoredRanges(sentence: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = []
  for (const pattern of IGNORED_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(sentence))) {
      ranges.push({ start: match.index, end: match.index + match[0].length })
    }
  }
  return ranges
}

/** 按段落分句；返回的 start/end 是相对于完整 text 的偏移。 */
export function segmentSentences(rawInput: string): {
  text: string
  sentences: SentenceRecord[]
  paragraphCount: number
} {
  const { text, paragraphs } = prepareText(rawInput)
  if (!text) return { text: '', sentences: [], paragraphCount: 0 }

  const sentences: SentenceRecord[] = []
  let cursor = 0

  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0) cursor += 2 // "\n\n"
    const segments = [...sentenceSegmenter.segment(paragraph)]
    for (const segment of segments) {
      const raw = segment.segment
      const trimmed = raw.trim()
      if (!trimmed) continue
      const leading = raw.length - raw.trimStart().length
      const start = cursor + segment.index + leading
      const end = start + trimmed.length
      if (!/[\p{L}\p{N}]/u.test(trimmed)) continue
      sentences.push({
        index: sentences.length,
        p: paragraphIndex + 1,
        text: trimmed,
        start,
        end,
      })
    }
    cursor += paragraph.length
  })

  return { text, sentences, paragraphCount: paragraphs.length }
}

function isWordChar(char: string | undefined): boolean {
  return Boolean(char && /[\p{L}\p{N}'’]/u.test(char))
}

/** 分词：保留 offset，合并连字符复合词，处理复数所有格撇号。 */
export function tokenizeSentence(sentence: string): RawToken[] {
  const segments = [...wordSegmenter.segment(sentence)]
  const ignored = ignoredRanges(sentence)
  const tokens: RawToken[] = []

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    if (!segment.isWordLike) continue
    let start = segment.index
    let end = start + segment.segment.length
    let surface = segment.segment

    // 复数所有格：students' → students'
    const after = sentence[end]
    if ((after === "'" || after === '’') && !isWordChar(sentence[end + 1])) {
      end += 1
      surface += after
    }

    // 连字符复合词：well-known / state-of-the-art
    const parts: { start: number; end: number; surface: string }[] = [
      { start, end, surface },
    ]
    let cursor = end
    while (true) {
      const hyphen = sentence[cursor]
      if (hyphen !== '-' && hyphen !== '‐' && hyphen !== '‑') break
      const next = segments[i + 1]
      const nextNext = segments[i + 2]
      if (!next || !nextNext || !nextNext.isWordLike) break
      if (next.segment !== '-' && next.segment !== '‐' && next.segment !== '‑') break
      if (next.index !== cursor) break
      if (nextNext.index !== cursor + 1) break
      const partStart = nextNext.index
      const partEnd = partStart + nextNext.segment.length
      surface = sentence.slice(start, partEnd)
      end = partEnd
      parts.push({ start: partStart, end: partEnd, surface: nextNext.segment })
      cursor = partEnd
      i += 2
    }

    const overlapsIgnored = ignored.some((range) => start < range.end && end > range.start)
    if (overlapsIgnored) continue
    if (!/\p{L}/u.test(surface)) continue

    tokens.push({
      start,
      end,
      surface,
      parts: parts.length > 1 ? parts : undefined,
    })
  }

  return tokens
}

export function firstWordStart(sentence: string): number {
  const token = tokenizeSentence(sentence)[0]
  return token ? token.start : 0
}

export function containsCjk(text: string): boolean {
  return /\p{Script=Han}/u.test(text)
}

export function containsMarkdown(text: string): boolean {
  return (
    /(^|\n)\s{0,3}#{1,6}\s/.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /(^|\n)\s*[-*+]\s+/.test(text) ||
    /`[^`]+`/.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text)
  )
}

export function containsParentheses(text: string): boolean {
  return /[()（）]/.test(text)
}
