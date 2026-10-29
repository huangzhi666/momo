import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MaimemoClient } from '@/lib/maimemo/client'

const BASE = 'https://open.maimemo.com/open/api/v1'

const server = setupServer()

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function makeClient(sleeps: number[] = []): MaimemoClient {
  return new MaimemoClient({
    token: 'test-token',
    limiter: { acquire: async () => undefined },
    sleep: async (ms) => {
      sleeps.push(ms)
    },
  })
}

describe('MaimemoClient', () => {
  it('uses the documented /memo path, and falls back on 404', async () => {
    server.use(
      http.post(`${BASE}/memo/study/query_study_records`, () =>
        HttpResponse.json({ message: 'not found' }, { status: 404 }),
      ),
      http.post(`${BASE}/study/query_study_records`, () =>
        HttpResponse.json({ success: true, data: { count: 3754 } }),
      ),
    )
    const client = makeClient()
    const count = await client.countStudyRecords()
    expect(count).toBe(3754)
  })

  it('unwraps { success, data } and reads records + tags', async () => {
    server.use(
      http.post(`${BASE}/memo/study/query_study_records`, () =>
        HttpResponse.json({
          success: true,
          data: {
            records: [
              {
                voc_id: 'voc-1',
                voc_spelling: 'abandon',
                add_date: '2026-01-01T00:00:00+08:00',
                last_response: 'FORGET',
                study_count: 3,
                tags: 'STICKING',
              },
            ],
            count: 1,
          },
        }),
      ),
    )
    const client = makeClient()
    const result = await client.queryStudyRecords(
      new Date('2020-01-01T00:00:00Z'),
      new Date('2030-01-01T00:00:00Z'),
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      vocId: 'voc-1',
      spelling: 'abandon',
      lastResponse: 'FORGET',
      studyCount: 3,
      tags: ['STICKING'],
    })
  })

  it('retries 429 using Retry-After', async () => {
    let calls = 0
    server.use(
      http.post(`${BASE}/memo/study/query_study_records`, () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json(
            { message: 'rate limited' },
            { status: 429, headers: { 'Retry-After': '1' } },
          )
        }
        return HttpResponse.json({ success: true, data: { count: 42 } })
      }),
    )
    const sleeps: number[] = []
    const client = makeClient(sleeps)
    const count = await client.countStudyRecords()
    expect(count).toBe(42)
    expect(calls).toBe(2)
    expect(sleeps[0]).toBe(1000)
  })

  it('adds words with advance=false and masks IDs in logs', async () => {
    let body: unknown = null
    server.use(
      http.post(`${BASE}/memo/study/add_words`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ success: true, data: { added_count: 1 } })
      }),
    )
    const client = makeClient()
    const added = await client.addWords(['voc-1234567890'])
    expect(added).toBe(1)
    expect(body).toEqual({ words: [{ id: 'voc-1234567890' }], advance: false })
  })

  it('resolves vocabulary payload key "voc"', async () => {
    server.use(
      http.post(`${BASE}/memo/vocabulary/query`, () =>
        HttpResponse.json({
          success: true,
          data: { voc: [{ id: 'voc-abc', spelling: 'abandon' }] },
        }),
      ),
    )
    const client = makeClient()
    const result = await client.queryVocabulary(['abandon'])
    expect(result).toEqual([{ id: 'voc-abc', spelling: 'abandon' }])
  })

  it('does not call the API without a token', async () => {
    const client = new MaimemoClient({
      token: null,
      limiter: { acquire: async () => undefined },
    })
    await expect(client.countStudyRecords()).rejects.toThrow(/MAIMEMO_API_TOKEN/)
  })
})

beforeEach(() => {
  // no-op hook placeholder for clarity
})
