import { sleep } from '@/lib/utils'

interface Waiter {
  acquire(): Promise<void>
}

export interface RateLimiterOptions {
  minIntervalMs?: number
  windows?: { windowMs: number; limit: number }[]
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_WINDOWS = [
  { windowMs: 10_000, limit: 20 },
  { windowMs: 60_000, limit: 40 },
  { windowMs: 5 * 60 * 60 * 1000, limit: 2000 },
]

/**
 * 墨墨频控：10 秒 20 次、60 秒 40 次、5 小时 2000 次。
 * 实测 60ms 间隔必 429，本实现默认请求间隔 ≥2s，且全局串行。
 */
export class MaimemoRateLimiter implements Waiter {
  private chain: Promise<void> = Promise.resolve()
  private times: number[] = []
  private minIntervalMs: number
  private windows: { windowMs: number; limit: number }[]
  private now: () => number
  private sleepFn: (ms: number) => Promise<void>

  constructor(options: RateLimiterOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 2000
    this.windows = options.windows ?? DEFAULT_WINDOWS
    this.now = options.now ?? Date.now
    this.sleepFn = options.sleep ?? sleep
  }

  acquire(): Promise<void> {
    const run = this.chain.then(() => this.turn())
    this.chain = run.catch(() => undefined)
    return run
  }

  private async turn(): Promise<void> {
    for (;;) {
      const now = this.now()
      const maxWindow = Math.max(...this.windows.map((window) => window.windowMs))
      this.times = this.times.filter((time) => now - time < maxWindow)
      let waitMs = 0
      if (this.times.length > 0) {
        const last = this.times[this.times.length - 1]
        waitMs = Math.max(waitMs, last + this.minIntervalMs - now)
      }
      for (const window of this.windows) {
        const recent = this.times.filter((time) => now - time < window.windowMs)
        if (recent.length >= window.limit) {
          const oldest = recent[recent.length - window.limit]
          waitMs = Math.max(waitMs, oldest + window.windowMs - now + 50)
        }
      }
      if (waitMs <= 0) {
        this.times.push(now)
        return
      }
      await this.sleepFn(waitMs)
    }
  }
}

const globalLimiter = globalThis as unknown as { __lexiloopMaimemoLimiter?: MaimemoRateLimiter }
export const maimemoLimiter =
  globalLimiter.__lexiloopMaimemoLimiter ?? new MaimemoRateLimiter()
globalLimiter.__lexiloopMaimemoLimiter = maimemoLimiter
