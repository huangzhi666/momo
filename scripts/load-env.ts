import fs from 'node:fs'
import path from 'node:path'

/**
 * CLI 脚本不会经过 Next.js 的 env 加载流程，这里显式加载 .env.local / .env。
 * 已存在的进程环境变量保持优先（Node 的 loadEnvFile 不覆盖已有值）。
 */
for (const file of ['.env.local', '.env']) {
  const full = path.resolve(process.cwd(), file)
  if (fs.existsSync(full)) {
    try {
      process.loadEnvFile(full)
    } catch (error) {
      console.warn(`[env] 读取 ${file} 失败：${error instanceof Error ? error.message : error}`)
    }
  }
}
