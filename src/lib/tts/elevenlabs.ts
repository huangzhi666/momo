import { TtsError, type TtsContext, type TtsProvider, type TtsResult, type TtsVoice } from './types'

export class ElevenLabsTtsProvider implements TtsProvider {
  id = 'elevenlabs'
  model: string
  private key: string
  private voiceId: string

  constructor(key: string, model: string, voiceId: string) {
    this.key = key
    this.model = model
    this.voiceId = voiceId
  }

  async synthesize(text: string, _voice: TtsVoice, context?: TtsContext): Promise<TtsResult> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voiceId)}?output_format=mp3_44100_128`
    const body: Record<string, unknown> = {
      text,
      model_id: this.model,
    }
    if (context?.previousText) body.previous_text = context.previousText
    if (context?.nextText) body.next_text = context.nextText

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new TtsError(`ElevenLabs TTS ${response.status}: ${detail.slice(0, 200)}`)
    }
    const audio = Buffer.from(await response.arrayBuffer())
    return { audio, ext: 'mp3', model: this.model }
  }
}
