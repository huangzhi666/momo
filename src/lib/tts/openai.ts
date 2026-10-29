import { TtsError, type TtsProvider, type TtsResult, type TtsVoice } from './types'

const VOICE_MAP: Record<string, string> = {
  'female-us': 'nova',
  'male-us': 'onyx',
  'female-uk': 'shimmer',
  'male-uk': 'echo',
}

export class OpenAiTtsProvider implements TtsProvider {
  id = 'openai'
  model: string
  private key: string

  constructor(key: string, model: string) {
    this.key = key
    this.model = model
  }

  async synthesize(text: string, voice: TtsVoice): Promise<TtsResult> {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        voice: VOICE_MAP[voice.id] ?? 'nova',
        input: text,
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new TtsError(`OpenAI TTS ${response.status}: ${detail.slice(0, 200)}`)
    }
    const audio = Buffer.from(await response.arrayBuffer())
    return { audio, ext: 'mp3', model: this.model }
  }
}
