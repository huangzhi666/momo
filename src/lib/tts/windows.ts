import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getDataDir } from '@/lib/env'
import { TtsError, type TtsProvider, type TtsResult, type TtsVoice } from './types'
import { wavDurationMs } from './wav'

const SCRIPT = String.raw`param([string]$TextFile, [string]$OutFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = @($s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'en-*' })
if ($voices.Count -eq 0) { $s.Dispose(); exit 2 }
$female = $voices | Where-Object { $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1
$chosen = if ($female) { $female } else { $voices[0] }
$s.SelectVoice($chosen.VoiceInfo.Name)
$s.Rate = -1
$s.SetOutputToWaveFile($OutFile)
$s.Speak($text)
$s.Dispose()
exit 0
`

function scriptPath(): string {
  const dir = path.join(getDataDir(), 'tmp')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'tts-sapi.ps1')
  if (!fs.existsSync(file)) fs.writeFileSync(file, SCRIPT, 'utf8')
  return file
}

function runPowerShell(script: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
      { windowsHide: true, stdio: 'ignore' },
    )
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('本地朗读超时'))
    }, 45_000)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`本地朗读进程退出码 ${code}`))
    })
  })
}

/**
 * Windows 本地朗读：System.Speech（SAPI），离线可用，仅 Windows。
 * 作为没有云 TTS Key 时的 Demo 后备；不保证英音/男声，实际使用系统已装英文音色。
 */
export class WindowsSapiProvider implements TtsProvider {
  id = 'local-sapi'
  model = 'system-speech'

  static platformAvailable(): boolean {
    return process.platform === 'win32'
  }

  async synthesize(text: string, _voice: TtsVoice): Promise<TtsResult> {
    if (!WindowsSapiProvider.platformAvailable()) {
      throw new TtsError('本地朗读仅支持 Windows')
    }
    const dir = path.join(getDataDir(), 'tmp')
    fs.mkdirSync(dir, { recursive: true })
    const id = randomUUID()
    const textFile = path.join(dir, `sapi-${id}.txt`)
    const outFile = path.join(dir, `sapi-${id}.wav`)
    try {
      fs.writeFileSync(textFile, text, 'utf8')
      await runPowerShell(scriptPath(), ['-TextFile', textFile, '-OutFile', outFile])
      if (!fs.existsSync(outFile)) throw new TtsError('SAPI 未生成音频文件')
      const audio = fs.readFileSync(outFile)
      if (audio.length < 100) throw new TtsError('SAPI 音频为空')
      return {
        audio,
        ext: 'wav',
        durationMs: wavDurationMs(audio) ?? undefined,
        model: this.model,
      }
    } catch (error) {
      throw new TtsError(
        `本地朗读失败：${error instanceof Error ? error.message : '未知错误'}`,
      )
    } finally {
      try {
        fs.rmSync(textFile, { force: true })
        fs.rmSync(outFile, { force: true })
      } catch {
        // ignore
      }
    }
  }
}
