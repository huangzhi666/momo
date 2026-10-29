export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFIG'
  | 'TEXT_TOO_LONG'
  | 'ANALYSIS_FAILED'
  | 'GENERATION_FAILED'
  | 'VALIDATION_FAILED'
  | 'MAIMEMO_ERROR'
  | 'MAIMEMO_RATE_LIMIT'
  | 'LLM_ERROR'
  | 'TTS_ERROR'
  | 'DB_NOT_READY'
  | 'INTERNAL'

export class AppError extends Error {
  code: ErrorCode
  status: number
  details?: unknown

  constructor(code: ErrorCode, message: string, status = 400, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '未知错误'
}
