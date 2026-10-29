import path from 'node:path'
import { getDataDir, demoReason, getMaimemoToken, getLlmConfig, isDemoMode } from '@/lib/env'
import { getEcdictCount } from '@/lib/dict/ecdict'
import { getVocabCount, getVocabSource } from '@/lib/db/queries'
import { getLastSyncAt, getVocabSyncState } from '@/lib/maimemo/sync'
import { getDefaultOxfordMode } from '@/lib/settings'
import { getTtsProviderInfo } from '@/lib/tts/service'
import type { AppStatus } from '@/lib/types'

export function getAppStatus(): AppStatus {
  const llm = getLlmConfig()
  let baseUrlHost: string | null = null
  try {
    baseUrlHost = new URL(llm.baseUrl).host
  } catch {
    baseUrlHost = null
  }
  const tts = getTtsProviderInfo()
  const ecdictWords = getEcdictCount()
  return {
    demo: isDemoMode(),
    demoReason: demoReason(),
    ecdictReady: ecdictWords > 100_000,
    ecdictWords,
    vocabCount: getVocabCount(),
    vocabSource: getVocabSource(),
    lastSyncAt: getLastSyncAt(),
    syncRunning: getVocabSyncState().running,
    llm: { configured: llm.configured, model: llm.configured ? llm.model : null, baseUrlHost },
    tts: { provider: tts.provider, configured: tts.configured, local: tts.local },
    maimemo: { configured: Boolean(getMaimemoToken()), tokenPreview: null },
    oxfordMode: getDefaultOxfordMode(),
    dataDir: path.basename(getDataDir()),
  }
}
