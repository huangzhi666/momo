/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse'
import { getRawDb } from '../src/lib/db/index'

const file = process.argv[2] || path.join(process.cwd(), 'data', 'raw', 'ecdict.csv')
const force = process.argv.includes('--force')

if (!fs.existsSync(file)) {
  console.error(`未找到 ECDICT CSV：${file}`)
  console.error('运行 pnpm setup 会自动下载并导入。')
  process.exit(1)
}

const db = getRawDb()
const existing = db.prepare('SELECT count(*) AS c FROM ecdict').get() as { c: number }
if (existing.c > 700_000 && !force) {
  console.log(`ecdict 已有 ${existing.c} 条，跳过导入。加 --force 可重新导入。`)
  process.exit(0)
}

db.pragma('synchronous = OFF')
if (force) {
  console.log('清空旧词典…')
  db.exec('DELETE FROM ecdict; DELETE FROM lemma_map;')
}

const insertWord = db.prepare(`
  INSERT INTO ecdict (word, phonetic, translation, definition, pos, tag, frq, bnc, oxford, collins, exchange, detail)
  VALUES (@word, @phonetic, @translation, @definition, @pos, @tag, @frq, @bnc, @oxford, @collins, @exchange, @detail)
  ON CONFLICT(word) DO UPDATE SET
    phonetic = excluded.phonetic, translation = excluded.translation, definition = excluded.definition,
    pos = excluded.pos, tag = excluded.tag, frq = excluded.frq, bnc = excluded.bnc,
    oxford = excluded.oxford, collins = excluded.collins, exchange = excluded.exchange, detail = excluded.detail
`)
const insertLemma = db.prepare('INSERT OR IGNORE INTO lemma_map (surface, lemma) VALUES (?, ?)')

function num(value: string | undefined | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function lemmaForms(exchange: string | null | undefined): string[] {
  if (!exchange) return []
  const out: string[] = []
  for (const part of exchange.split('/')) {
    const idx = part.indexOf(':')
    if (idx <= 0) continue
    const code = part.slice(0, idx)
    if (!['p', 'd', 'i', '3', 'r', 't', 's'].includes(code)) continue
    for (const form of part.slice(idx + 1).split('/')) {
      const normalized = form.trim().toLowerCase()
      if (!normalized) continue
      if (!/^[a-z][a-z'-]*$/.test(normalized)) continue
      out.push(normalized)
    }
  }
  return out
}

async function main() {
  const parser = fs
    .createReadStream(file, { encoding: 'utf8' })
    .pipe(parse({ columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true }))

  let rows = 0
  let words = 0
  let lemmaRows = 0
  let batch: Record<string, unknown>[] = []
  let lemmaBatch: [string, string][] = []

  const flush = db.transaction(() => {
    for (const record of batch) insertWord.run(record)
    for (const [surface, lemma] of lemmaBatch) insertLemma.run(surface, lemma)
    rows += batch.length
    words += batch.length
    lemmaRows += lemmaBatch.length
    batch = []
    lemmaBatch = []
  })

  for await (const record of parser) {
    const rawWord = String(record.word ?? '').trim()
    if (!rawWord) continue
    const word = rawWord.toLowerCase()
    const exchange = record.exchange ? String(record.exchange) : null
    batch.push({
      word,
      phonetic: record.phonetic ? String(record.phonetic) : null,
      translation: record.translation ? String(record.translation) : null,
      definition: record.definition ? String(record.definition) : null,
      pos: record.pos ? String(record.pos) : null,
      tag: record.tag ? String(record.tag) : null,
      frq: num(record.frq),
      bnc: num(record.bnc),
      oxford: num(record.oxford) ?? 0,
      collins: num(record.collins),
      exchange,
      detail: record.detail ? String(record.detail) : null,
    })
    if (/^[a-z][a-z'-]*$/.test(word) && !word.includes('-')) {
      for (const form of lemmaForms(exchange)) {
        if (form !== word) lemmaBatch.push([form, word])
      }
    }
    if (batch.length >= 3000) {
      flush()
      if (rows % 30_000 === 0) {
        console.log(`  ${rows.toLocaleString()} words, ${lemmaRows.toLocaleString()} lemma forms…`)
      }
    }
  }
  if (batch.length) flush()

  console.log(`导入完成：${words.toLocaleString()} 个词条，${lemmaRows.toLocaleString()} 条词形映射。`)
  console.log('执行 ANALYZE…')
  db.exec('ANALYZE;')
  db.pragma('synchronous = NORMAL')
  db.pragma('wal_checkpoint(TRUNCATE)')
  const ecdictCount = (db.prepare('SELECT count(*) AS c FROM ecdict').get() as { c: number }).c
  const lemmaCount = (db.prepare('SELECT count(*) AS c FROM lemma_map').get() as { c: number }).c
  console.log(`数据库：ecdict=${ecdictCount.toLocaleString()} lemma_map=${lemmaCount.toLocaleString()}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
