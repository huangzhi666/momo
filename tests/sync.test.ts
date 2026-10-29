import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { MaimemoClient } from '@/lib/maimemo/client'
import type { MaimemoStudyRecord } from '@/lib/maimemo/schemas'
import { runVocabSync } from '@/lib/maimemo/sync'
import { getSetting, getVocabCount } from '@/lib/db/queries'

const TOTAL = 3754
const BASE = Date.parse('2024-01-01T00:00:00Z')

function makeRecords(): MaimemoStudyRecord[] {
  return Array.from({ length: TOTAL }, (_, index) => {
    const next = new Date(BASE + index * 3_600_000).toISOString()
    return {
      vocId: `voc-${index}`,
      spelling: `word${index}`,
      addDate: next,
      firstStudyDate: next,
      lastStudyDate: next,
      nextStudyDate: next,
      lastResponse: index % 9 === 0 ? 'FORGET' : 'FAMILIAR',
      studyCount: index % 23,
      tags: index % 11 === 0 ? ['STICKING'] : [],
    }
  })
}

const records = makeRecords()

function inWindow(record: MaimemoStudyRecord, start: Date, end: Date): boolean {
  const time = Date.parse(record.nextStudyDate ?? '')
  return time >= start.getTime() && time < end.getTime()
}

function fakeClient(options: { failQueryAt?: number } = {}): Pick<
  MaimemoClient,
  'countStudyRecords' | 'queryStudyRecords'
> {
  let queries = 0
  return {
    async countStudyRecords(start: Date, end: Date) {
      return records.filter((record) => inWindow(record, start, end)).length
    },
    async queryStudyRecords(start: Date, end: Date, limit = 1000) {
      queries += 1
      if (options.failQueryAt && queries === options.failQueryAt) {
        throw new Error('模拟网络中断')
      }
      return records.filter((record) => inWindow(record, start, end)).slice(0, limit)
    },
  }
}

function stateFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexiloop-sync-'))
  return path.join(dir, `${name}.json`)
}

afterAll(() => {
  // 内存数据库由 Vitest 进程回收
})

describe('runVocabSync — time-window algorithm', () => {
  it('downloads 3754 unique records with missing = 0', async () => {
    const file = stateFile('full')
    const result = await runVocabSync({ client: fakeClient(), stateFile: file })
    expect(result.found).toBe(TOTAL)
    expect(result.phase).toBe('done')
    expect(result.requests).toBeGreaterThan(4)
    expect(getVocabCount()).toBe(TOTAL)
    expect(getSetting('vocabLastSync')).toBeTruthy()
    const summary = JSON.parse(getSetting('vocabSyncSummary') ?? '{}') as {
      missing: number
      unique: number
      requests: number
    }
    expect(summary.unique).toBe(TOTAL)
    expect(summary.missing).toBe(0)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('resumes from a partial state file after an interruption', async () => {
    const file = stateFile('resume')
    await expect(
      runVocabSync({ client: fakeClient({ failQueryAt: 3 }), stateFile: file }),
    ).rejects.toThrow('模拟网络中断')
    expect(fs.existsSync(file)).toBe(true)

    const resumed = await runVocabSync({ client: fakeClient(), stateFile: file })
    expect(resumed.found).toBe(TOTAL)
    expect(resumed.phase).toBe('done')
    expect(getVocabCount()).toBe(TOTAL)
    expect(fs.existsSync(file)).toBe(false)
  })
})
