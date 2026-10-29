/* eslint-disable no-console */
import './load-env'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const root = process.cwd()
const csvPath = path.join(root, 'data', 'raw', 'ecdict.csv')
const tarball = path.join(root, '.tmp', 'ecdict.tgz')
const extractDir = path.join(root, '.tmp', 'ecdict-extract')

async function download(url: string, out: string): Promise<void> {
  console.log(`下载 ${url}`)
  const response = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const tmp = out + '.part'
  await pipeline(Readable.fromWeb(response.body as never), fs.createWriteStream(tmp))
  fs.renameSync(tmp, out)
  console.log(`已保存 ${out}（${(fs.statSync(out).size / 1_048_576).toFixed(1)} MiB）`)
}

async function ensureEcdict(): Promise<void> {
  if (fs.existsSync(csvPath) && fs.statSync(csvPath).size > 50_000_000) {
    console.log('ECDICT CSV 已存在。')
    return
  }
  if (!fs.existsSync(tarball)) {
    await download('https://registry.npmmirror.com/ecdict/-/ecdict-0.0.4.tgz', tarball)
  }
  fs.mkdirSync(extractDir, { recursive: true })
  console.log('解压 ECDICT…')
  execSync(`tar -xzf "${tarball}" -C "${extractDir}" package/assets/ecdict.csv`, {
    stdio: 'inherit',
  })
  fs.mkdirSync(path.dirname(csvPath), { recursive: true })
  fs.copyFileSync(path.join(extractDir, 'package', 'assets', 'ecdict.csv'), csvPath)
  console.log('ECDICT 准备完成。')
}

async function main() {
  console.log('=== LexiLoop 初始化 ===')
  await ensureEcdict()

  const { getEcdictCount } = await import('../src/lib/dict/ecdict')
  if (getEcdictCount() < 700_000) {
    console.log('导入 ECDICT 到 SQLite…')
    execSync('pnpm db:import', { stdio: 'inherit', cwd: root })
  } else {
    console.log(`ECDICT 已导入：${getEcdictCount()} 条。`)
  }

  console.log('写入 Demo 词库与文章（含本地朗读音频）…')
  const { seedDemoContent } = await import('../src/lib/demo/seed')
  const result = await seedDemoContent({ audio: true })
  console.log(`Demo 词库 ${result.vocabCount} 条，文章 ${result.articleIds.length} 篇。`)
  for (const audio of result.audio) {
    console.log(`  音频 ${audio.articleId}: ${audio.ready}/${audio.total}（失败 ${audio.failed}）`)
  }
  console.log('=== 初始化完成，运行 pnpm dev 后打开 http://localhost:3000 ===')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
