import { normalizeApostrophes } from './lemma'

export interface PreparedText {
  text: string
  paragraphs: string[]
}

/** 统一弯引号、去多余空行、修复断词连字符。 */
export function cleanArticleText(input: string): string {
  let text = normalizeApostrophes(input)
  text = text
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/(\p{L})-\n(\p{L})/gu, '$1$2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

/**
 * 按空行切段，段内单换行合并为空格；返回重新拼接的规范文本与段落。
 * 句子 offset 基于返回的 text。
 */
export function prepareText(input: string): PreparedText {
  const cleaned = cleanArticleText(input)
  if (!cleaned) return { text: '', paragraphs: [] }
  const rawParagraphs = cleaned.split(/\n\s*\n/)
  const paragraphs = rawParagraphs
    .map((p) => p.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
    .filter(Boolean)
  return { text: paragraphs.join('\n\n'), paragraphs }
}

export function stripMarkdownNoise(input: string): string {
  return input
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1')
}
