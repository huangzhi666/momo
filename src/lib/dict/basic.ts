import fs from 'node:fs'
import path from 'node:path'
import { getBasicDir } from '@/lib/env'

export interface BasicData {
  functionWords: Set<string>
  oxford: Map<string, string>
  properNouns: Set<string>
  irregular: Map<string, string>
}

let cached: BasicData | null = null

function readLines(file: string): string[] {
  const full = path.join(getBasicDir(), file)
  if (!fs.existsSync(full)) return []
  return fs
    .readFileSync(full, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

export function getBasicData(): BasicData {
  if (cached) return cached
  const functionWords = new Set(readLines('function-words.txt').map((w) => w.toLowerCase()))
  const oxford = new Map<string, string>()
  for (const line of readLines('oxford-3000.txt')) {
    const [word, level] = line.split('\t')
    if (!word) continue
    const key = word.trim().toLowerCase()
    if (!oxford.has(key)) oxford.set(key, (level || '').trim() || 'A1')
  }
  const properNouns = new Set(readLines('proper-nouns.txt').map((w) => w.toLowerCase()))
  const irregular = new Map<string, string>()
  for (const line of readLines('irregular-forms.txt')) {
    const [surface, lemma] = line.split('\t')
    if (surface && lemma) irregular.set(surface.trim().toLowerCase(), lemma.trim().toLowerCase())
  }
  cached = { functionWords, oxford, properNouns, irregular }
  return cached
}

export function resetBasicCache(): void {
  cached = null
}

export function isFunctionWord(word: string): boolean {
  return getBasicData().functionWords.has(word.toLowerCase())
}

export function isProperNounWord(word: string): boolean {
  return getBasicData().properNouns.has(word.toLowerCase())
}

export function getIrregularLemma(word: string): string | undefined {
  return getBasicData().irregular.get(word.toLowerCase())
}

export function getOxfordLevel(word: string): string | undefined {
  return getBasicData().oxford.get(word.toLowerCase())
}

export function getOxfordListSize(): number {
  return getBasicData().oxford.size
}

/**
 * 生成英美拼写候选。只在候选确实存在时才使用（调用方负责校验）。
 * 例：colour → color；centre → center；realise → realize；travelling → traveling。
 */
export function spellingVariants(word: string): string[] {
  const w = word.toLowerCase()
  const variants = new Set<string>()
  const add = (v: string) => {
    if (v && v !== w) variants.add(v)
  }

  if (w.endsWith('our')) add(`${w.slice(0, -3)}or`)
  if (w.endsWith('ours')) add(`${w.slice(0, -4)}ors`)
  if (w.endsWith('oured')) add(`${w.slice(0, -5)}ored`)
  if (w.endsWith('ouring')) add(`${w.slice(0, -6)}oring`)
  if (w.endsWith('or')) add(`${w.slice(0, -2)}our`)
  if (w.endsWith('ize')) add(`${w.slice(0, -3)}ise`)
  if (w.endsWith('ise')) add(`${w.slice(0, -3)}ize`)
  if (w.endsWith('ization')) add(`${w.slice(0, -7)}isation`)
  if (w.endsWith('isation')) add(`${w.slice(0, -7)}ization`)
  if (w.endsWith('yze')) add(`${w.slice(0, -3)}yse`)
  if (w.endsWith('yse')) add(`${w.slice(0, -3)}yze`)
  if (w.endsWith('re')) add(`${w.slice(0, -2)}er`)
  if (w.endsWith('er')) add(`${w.slice(0, -2)}re`)
  if (w.endsWith('ogue')) add(`${w.slice(0, -4)}og`)
  if (w.endsWith('og')) add(`${w.slice(0, -2)}ogue`)
  if (w.endsWith('lled')) add(`${w.slice(0, -4)}led`)
  if (w.endsWith('lling')) add(`${w.slice(0, -5)}ling`)
  if (w.endsWith('ller')) add(`${w.slice(0, -4)}ler`)
  if (w.endsWith('lled') === false && w.endsWith('led')) add(`${w.slice(0, -3)}lled`)
  if (w.endsWith('ling')) add(`${w.slice(0, -4)}lling`)
  if (w.endsWith('ler')) add(`${w.slice(0, -3)}ller`)
  return [...variants]
}
