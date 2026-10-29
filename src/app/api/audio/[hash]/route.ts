import fs from 'node:fs'
import { AppError } from '@/lib/errors'
import { getAudioRecord } from '@/lib/tts/service'
import { jsonError, jsonOk } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function contentType(path: string): string {
  return path.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'
}

export async function GET(
  request: Request,
  context: { params: Promise<{ hash: string }> },
) {
  try {
    const { hash } = await context.params
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new AppError('NOT_FOUND', '音频不存在', 404)
    }
    const record = getAudioRecord(hash)
    if (!record) throw new AppError('NOT_FOUND', '音频不存在或已被清理', 404)
    const stat = fs.statSync(record.path)
    const range = request.headers.get('range')
    const baseHeaders: Record<string, string> = {
      'Content-Type': contentType(record.path),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    }

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
      if (!match) {
        throw new AppError('BAD_REQUEST', 'Range 格式不合法', 416)
      }
      const start = match[1] ? Number(match[1]) : 0
      const end = match[2] ? Number(match[2]) : stat.size - 1
      if (start >= stat.size || end >= stat.size || start > end) {
        return new Response(null, {
          status: 416,
          headers: { ...baseHeaders, 'Content-Range': `bytes */${stat.size}` },
        })
      }
      const length = end - start + 1
      const buffer = Buffer.alloc(length)
      const fd = fs.openSync(record.path, 'r')
      try {
        fs.readSync(fd, buffer, 0, length, start)
      } finally {
        fs.closeSync(fd)
      }
      return new Response(new Uint8Array(buffer), {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': String(length),
        },
      })
    }

    const buffer = fs.readFileSync(record.path)
    return new Response(new Uint8Array(buffer), {
      headers: { ...baseHeaders, 'Content-Length': String(stat.size) },
    })
  } catch (error) {
    return jsonError(error)
  }
}

export async function HEAD(
  _request: Request,
  context: { params: Promise<{ hash: string }> },
) {
  try {
    const { hash } = await context.params
    const record = getAudioRecord(hash)
    if (!record) return new Response(null, { status: 404 })
    const stat = fs.statSync(record.path)
    return new Response(null, {
      headers: {
        'Content-Type': contentType(record.path),
        'Accept-Ranges': 'bytes',
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
