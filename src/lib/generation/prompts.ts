import { GENRE_META, LEVEL_META, MAX_SUPPLEMENT_CHARS, type Genre, type Level } from '@/lib/constants'
import type { TargetWord } from './targets'
import { LEVEL_GUIDANCE } from './targets'

export interface GenerationPromptInput {
  level: Level
  length: number
  newTarget: number
  topic: string
  genre: Genre
  targets: TargetWord[]
  supplement: string
}

function targetLines(targets: TargetWord[]): string {
  if (targets.length === 0) return '(no target words were selected)'
  return targets
    .map((target, index) => `${index + 1}. ${target.lemma}${target.gloss ? ` — ${target.gloss}` : ''}`)
    .join('\n')
}

export function buildGenerationMessages(input: GenerationPromptInput): {
  system: string
  prompt: string
} {
  const level = LEVEL_META[input.level]
  const guidance = LEVEL_GUIDANCE[input.level]
  const supplement = input.supplement.trim().slice(0, MAX_SUPPLEMENT_CHARS)

  const system = `You are an experienced English writer creating short reading passages for a Chinese learner of English. You write concrete, natural prose, not textbook filler.

TASK
Write one complete English article for a single learner, then return it as a JSON object.

PARAMETERS
- Learner level: ${level.label} (${guidance.label}), CEFR ${guidance.cefr}
- Target length: ${input.length} words (within 15%)
- Genre: ${GENRE_META[input.genre].label} — ${GENRE_META[input.genre].prompt}
- Topic: ${input.topic}
- Distinct new words the learner should meet: about ${input.newTarget} (never more than ${input.newTarget + 3})
- Sentences: 14–24. Each sentence at most 30 words. Average at most 22 words.
- Paragraphs: 2–5. Use the "p" field (1, 2, 3 ...) to mark the paragraph.

THE LEARNER'S VOCABULARY
The learner knows Oxford 3000 (A1–B2) and about 3,700 words selected in a vocabulary app. Do not stuff those lists into the passage; simply prefer everyday English. The target words below are words the learner is currently studying and should appear naturally. ${guidance.sentence}

TARGET WORDS (use at least 60% of them, naturally; do not force awkward collocations)
${targetLines(input.targets)}

NEW-WORD BUDGET
Use only common, useful English. Apart from the target words, the learner should meet about ${input.newTarget} genuinely new content words. Do not use rare literary words, idioms that need cultural knowledge, or long noun compounds. At most 4 words may be outside the learner's level band.

HARD RULES (must all hold)
1. English only in the article. No Chinese characters anywhere in title or sentences. (summary_zh is the only Chinese field.)
2. No Markdown: no #, *, underscores, backticks, bullet lists, or links.
3. No parentheses of any kind: ( ) or （ ）.
4. No word list, glossary, translation, or notes inside the article.
5. No profanity, violence, sexual content, politics, or religious controversy.
6. Do not invent specific people's names, organisation names, brand names, statistics, or dates. Use roles and generic places: "the nurse", "a local library", "the city".
7. Do not write a title like "A Story About ...". At most 8 words. Make it specific and a little unusual.
8. No closing moral, no "in conclusion", no empty inspirational ending. End on a concrete detail, action, or line of dialogue.
9. Avoid AI-style parallelism ("not only ... but also", three-adjective lists) and vague uplift ("a testament to the human spirit").

STYLE
- A real scene, concrete objects, specific actions, small friction. Show, don't explain.
- Natural dialogue is welcome, but keep it readable.
- Vary sentence length. Prefer strong verbs to adjectives.
- Target words should feel chosen by the situation, not inserted.

USER'S EXTRA REQUIREMENTS
${supplement || '(none)'}
These are soft requirements. Follow them where possible. If they conflict with a hard rule, the hard rule wins; do not mention the conflict in the article.

OUTPUT
Return ONE JSON object only, with exactly this shape:
{
  "title": "string, at most 8 words",
  "topic": "string",
  "genre": "narrative | expository | news | dialogue | argument",
  "sentences": [{ "p": 1, "text": "..." }],
  "targets_used": ["lemma", "..."],
  "summary_zh": "一句话中文摘要，只用于历史列表"
}
The "genre" must be "${input.genre}". Do not add any other keys or commentary.`

  const prompt = `Write the article now.

Topic: ${input.topic}
Genre: ${input.genre}
Length: ${input.length} words
New-word budget: ${input.newTarget} distinct words
Target words: ${input.targets.map((t) => t.lemma).join(', ') || '(none)'}
${supplement ? `Extra requirements: ${supplement}` : ''}

Remember: JSON only. No text before or after it.`

  return { system, prompt }
}

export function buildRepairMessages(input: {
  originalSystem: string
  previous: unknown
  violations: string[]
  missingTargets: string[]
  newLemmas: string[]
  outOfBandLemmas: string[]
}): { system: string; prompt: string } {
  const issues = [
    ...input.violations.map((v) => `- ${v}`),
    input.missingTargets.length
      ? `- Missing target words: ${input.missingTargets.join(', ')}`
      : '',
    input.newLemmas.length ? `- New words currently used: ${input.newLemmas.join(', ')}` : '',
    input.outOfBandLemmas.length
      ? `- Out-of-band words currently used: ${input.outOfBandLemmas.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    system: `${input.originalSystem}

REVISION TASK
You are revising your previous article because deterministic checks failed. Keep the parts that work, but fix every listed problem. Replace the whole JSON object. Do not explain. Do not add keys.

Fix only what is necessary:
- Reduce the number of distinct new words to the budget, or replace them with common words.
- Replace out-of-band words with words the learner is more likely to know.
- Use the missing target words naturally.
- Remove any Chinese, Markdown, parentheses, names, or statistics.
- Keep the same genre and approximate length.`,
    prompt: `PREVIOUS ARTICLE (JSON):
${JSON.stringify(input.previous)}

PROBLEMS TO FIX:
${issues || '- General quality is not yet acceptable.'}

Return the full corrected JSON now.`,
  }
}

export function buildExamplesMessages(lemma: string, translation: string | null): {
  system: string
  prompt: string
} {
  return {
    system: `You write example sentences for a Chinese learner of English. Write one or two short, concrete sentences that show the meaning of the target word clearly. Each sentence must contain the exact word "${lemma}" (any inflection is fine). Provide a natural Chinese translation. Avoid names, statistics, and parentheses. Return JSON only: { "examples": [{ "text": "...", "translation": "..." }] }.`,
    prompt: `Word: ${lemma}${translation ? `\nChinese meaning: ${translation.slice(0, 160)}` : ''}\nWrite 2 examples at CEFR B1 level.`,
  }
}
