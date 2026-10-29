export function estimateDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const seconds = words / 2.6 + 0.55
  return Math.round(Math.min(30_000, Math.max(1_200, seconds * 1000)))
}

/** 16-bit PCM mono silent WAV. */
export function makeSilentWav(durationMs: number, sampleRate = 22_050): Buffer {
  const samples = Math.max(1, Math.floor((sampleRate * durationMs) / 1000))
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

export function wavDurationMs(buffer: Buffer): number | null {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') return null
  let offset = 12
  let byteRate = 0
  let dataSize = 0
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    if (id === 'fmt ' && offset + 16 <= buffer.length) {
      byteRate = buffer.readUInt32LE(offset + 16)
    } else if (id === 'data') {
      dataSize = size
      break
    }
    offset += 8 + size + (size % 2)
  }
  if (!byteRate || !dataSize) return null
  return Math.round((dataSize / byteRate) * 1000)
}
