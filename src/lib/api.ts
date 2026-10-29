import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AppError } from '@/lib/errors'

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details ?? null } },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  if (error instanceof ZodError) {
    const message = error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ')
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: `请求参数不合法：${message}` } },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  console.error('[api] unhandled error', error)
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: '服务端内部错误，请查看终端日志或稍后重试。' } },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new AppError('BAD_REQUEST', '请求体不是合法 JSON', 400)
  }
}

export async function readOptionalJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (!text.trim()) return {}
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    throw new AppError('BAD_REQUEST', '请求体不是合法 JSON', 400)
  }
}

export function queryInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}
