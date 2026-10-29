import { estimateDurationMs, makeSilentWav } from './wav'
import type { TtsProvider, TtsResult, TtsVoice } from './types'

/**
 * 静音占位音轨：没有配置云 TTS 且本地 SAPI 不可用时使用。
 * 仍然按句估计时长，跟读留白和变速播放可以完整工作；只是没有人声。
 */
export class MockTtsProvider implements TtsProvider {
  id = 'mock'
  model = 'silence'

  async synthesize(text: string, _voice: TtsVoice): Promise<TtsResult> {
    const durationMs = estimateDurationMs(text)
    return {
      audio: makeSilentWav(durationMs),
      ext: 'wav',
      durationMs,
      model: this.model,
    }
  }
}
