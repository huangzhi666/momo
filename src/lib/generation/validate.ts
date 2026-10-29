import type { ArticleMetrics } from '@/lib/types'
import { containsCjk, containsMarkdown, containsParentheses } from '@/lib/text/segment'

export interface ValidationCheck {
  key: string
  label: string
  ok: boolean
  actual: string
  expected: string
  blocking: boolean
}

export interface ValidationResult {
  checks: ValidationCheck[]
  blocking: ValidationCheck[]
  warnings: ValidationCheck[]
  acceptable: boolean
  needsRepair: boolean
  repairFocus: {
    newLemmas: string[]
    outOfBandLemmas: string[]
    missingTargets: string[]
    otherIssues: string[]
  }
}

export interface ValidateInput {
  title: string
  text: string
  metrics: ArticleMetrics
  length: number
  newTarget: number
  targets: string[]
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

export function validateArticle(input: ValidateInput): ValidationResult {
  const { title, text, metrics, length, newTarget, targets } = input
  const checks: ValidationCheck[] = []

  const wordMin = Math.round(length * 0.85)
  const wordMax = Math.round(length * 1.15)
  checks.push({
    key: 'word_count',
    label: `词数 ${length} ±15%`,
    ok: metrics.wordCount >= wordMin && metrics.wordCount <= wordMax,
    actual: `${metrics.wordCount}`,
    expected: `${wordMin}–${wordMax}`,
    blocking: false,
  })

  checks.push({
    key: 'sentence_count',
    label: '句子数 14–24',
    ok: metrics.sentenceCount >= 14 && metrics.sentenceCount <= 24,
    actual: `${metrics.sentenceCount}`,
    expected: '14–24',
    blocking: false,
  })

  checks.push({
    key: 'max_sentence',
    label: '单句 ≤30 词',
    ok: metrics.maxSentenceLength <= 30,
    actual: `${metrics.maxSentenceLength}`,
    expected: '≤30',
    blocking: false,
  })

  checks.push({
    key: 'avg_sentence',
    label: '平均句长 ≤22 词',
    ok: metrics.avgSentenceLength <= 22,
    actual: `${metrics.avgSentenceLength}`,
    expected: '≤22',
    blocking: false,
  })

  checks.push({
    key: 'new_count',
    label: `生词数 ≤ 目标 + 3`,
    ok: metrics.newCount <= newTarget + 3,
    actual: `${metrics.newCount}`,
    expected: `≤${newTarget + 3}`,
    blocking: true,
  })

  checks.push({
    key: 'new_density',
    label: '生词密度 ≤12%',
    ok: metrics.newDensity <= 0.12,
    actual: pct(metrics.newDensity),
    expected: '≤12%',
    blocking: true,
  })

  checks.push({
    key: 'out_of_band',
    label: '超纲词 ≤4',
    ok: metrics.outOfBandCount <= 4,
    actual: `${metrics.outOfBandCount}`,
    expected: '≤4',
    blocking: true,
  })

  checks.push({
    key: 'target_coverage',
    label: '目标词覆盖 ≥60%',
    ok: targets.length === 0 || metrics.targetCoverage >= 0.6,
    actual: targets.length ? pct(metrics.targetCoverage) : '无目标词',
    expected: '≥60%',
    blocking: targets.length > 0,
  })

  checks.push({
    key: 'target_lower',
    label: '生词不过少（参考）',
    ok: metrics.newCount >= Math.max(0, newTarget - 3),
    actual: `${metrics.newCount}`,
    expected: `≥${Math.max(0, newTarget - 3)}`,
    blocking: false,
  })

  const noCjk = !containsCjk(text)
  checks.push({
    key: 'no_cjk',
    label: '正文无中文',
    ok: noCjk,
    actual: noCjk ? '无' : '含中文',
    expected: '无',
    blocking: true,
  })

  const noMarkdown = !containsMarkdown(text)
  checks.push({
    key: 'no_markdown',
    label: '无 Markdown 标记',
    ok: noMarkdown,
    actual: noMarkdown ? '无' : '含标记',
    expected: '无',
    blocking: true,
  })

  const noParens = !containsParentheses(text)
  checks.push({
    key: 'no_parentheses',
    label: '无括号注释',
    ok: noParens,
    actual: noParens ? '无' : '含括号',
    expected: '无',
    blocking: true,
  })

  const titleWords = title.trim().split(/\s+/).filter(Boolean).length
  const titleOk =
    titleWords > 0 &&
    titleWords <= 8 &&
    !/^a\s+story\s+about/i.test(title.trim()) &&
    !containsCjk(title)
  checks.push({
    key: 'title',
    label: '标题 ≤8 词、非模板、无中文',
    ok: titleOk,
    actual: title || '空',
    expected: '≤8 词',
    blocking: true,
  })

  const blocking = checks.filter((check) => !check.ok && check.blocking)
  const warnings = checks.filter((check) => !check.ok && !check.blocking)
  const missingTargets = targets.filter(
    (target) => !metrics.targetUsed.some((used) => used.toLowerCase() === target.toLowerCase()),
  )
  const otherIssues = blocking
    .filter((check) => !['new_count', 'new_density', 'out_of_band', 'target_coverage'].includes(check.key))
    .map((check) => check.label)

  return {
    checks,
    blocking,
    warnings,
    acceptable: blocking.length === 0,
    needsRepair: blocking.length > 0,
    repairFocus: {
      newLemmas: metrics.newLemmas,
      outOfBandLemmas: metrics.outOfBandLemmas,
      missingTargets,
      otherIssues,
    },
  }
}

export function violationSummary(result: ValidationResult): string[] {
  return result.blocking.map((check) => `${check.label}（实际 ${check.actual}，要求 ${check.expected}）`)
}
