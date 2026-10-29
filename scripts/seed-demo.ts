/* eslint-disable no-console */
import './load-env'
import { getEcdictCount } from '../src/lib/dict/ecdict'
import { seedDemoContent } from '../src/lib/demo/seed'
import { getVocabCount } from '../src/lib/db/queries'

async function main() {
  const force = process.argv.includes('--force')
  const audio = !process.argv.includes('--no-audio')
  const resetVocab = process.argv.includes('--reset-vocab')

  if (getEcdictCount() < 1000) {
    console.warn('ECDICT 尚未导入，Demo 文章的标注会不准确。请先运行 pnpm db:import。')
  }

  console.log(`开始写入 Demo 内容（force=${force}, audio=${audio}, resetVocab=${resetVocab}）…`)
  const result = await seedDemoContent({ force, audio, resetVocab })
  console.log(`Demo 词库：${result.vocabCount} 个（当前 vocab 表 ${getVocabCount()} 条）`)
  console.log(`Demo 文章：${result.articleIds.length} 篇`)
  for (const item of result.audio) {
    console.log(`  音频 ${item.articleId}: ${item.ready}/${item.total}，失败 ${item.failed}`)
  }
  console.log('完成。')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
