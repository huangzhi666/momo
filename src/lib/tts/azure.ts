import { TtsError, type TtsContext, type TtsProvider, type TtsResult, type TtsVoice } from './types'

const VOICE_MAP: Record<string, string> = {
  'female-us': 'en-US-JennyNeural',
  'male-us': 'en-US-GuyNeural',
  'female-uk': 'en-GB-SoniaNeural',
  'male-uk': 'en-GB-RyanNeural',
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export class AzureTtsProvider implements TtsProvider {
  id = 'azure'
  model: string
  private key: string
  private region: string

  constructor(key: string, region: string) {
    this.key = key
    this.region = region
    this.model = `azure-speech:${region}`
  }

  async synthesize(text: string, voice: TtsVoice, _context?: TtsContext): Promise<TtsResult> {
    const voiceName = VOICE_MAP[voice.id] ?? VOICE_MAP['female-us']
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${voiceName}"><prosody rate="0%">${escapeXml(text)}</prosody></voice></speak>`
    const url = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'LexiLoop/0.1',
      },
      body: ssml,
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new TtsError(`Azure TTS ${response.status}: ${detail.slice(0, 200)}`)
    }
    const audio = Buffer.from(await response.arrayBuffer())
    return { audio, ext: 'mp3', model: voiceName }
  }
}
