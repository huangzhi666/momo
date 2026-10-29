/* eslint-disable no-console */
import './load-env'
import { runVocabSync, type VocabSyncProgress } from '../src/lib/maimemo/sync'
import { getMaimemoToken } from '../src/lib/env'

async function main() {
  if (!getMaimemoToken()) {
    console.error('缺少 MAIMEMO_API_TOKEN。请复制 .env.example 为 .env.local 并填写 Token。')
    process.exit(1)
  }
  const reset = process.argv.includes('--reset')
  let lastMessage = ''
  const progress = await runVocabSync({
    reset,
    onProgress: (state: VocabSyncProgress) => {
      if (state.message !== lastMessage) {
        lastMessage = state.message
        console.log(
          `[${state.phase}] requests=${state.requests} found=${state.found} queue=${state.queue} — ${state.message}`,
        )
      }
    },
  })
  console.log('同步完成：', progress)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
