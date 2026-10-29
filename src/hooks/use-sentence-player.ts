'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SentenceWithTokens } from '@/lib/types'

export type PlayMode = 'continuous' | 'shadow'

interface PlayerOptions {
  onMissingAudio?: (index: number) => void
  onPlayError?: () => void
}

export function useSentencePlayer(sentences: SentenceWithTokens[], options: PlayerOptions = {}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRateState] = useState(1)
  const [mode, setModeState] = useState<PlayMode>('continuous')
  const [gapFactor, setGapFactorState] = useState(1.2)
  const [sentenceLoop, setSentenceLoopState] = useState(1)
  const [wholeLoop, setWholeLoopState] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const sentencesRef = useRef(sentences)
  const currentRef = useRef(0)
  const rateRef = useRef(1)
  const modeRef = useRef<PlayMode>('continuous')
  const gapFactorRef = useRef(1.2)
  const sentenceLoopRef = useRef(1)
  const wholeLoopRef = useRef(false)
  const loopDoneRef = useRef(0)
  const optionsRef = useRef(options)

  sentencesRef.current = sentences
  optionsRef.current = options

  useEffect(() => {
    currentRef.current = currentIndex
  }, [currentIndex])
  useEffect(() => {
    rateRef.current = rate
  }, [rate])
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    gapFactorRef.current = gapFactor
  }, [gapFactor])
  useEffect(() => {
    sentenceLoopRef.current = sentenceLoop
  }, [sentenceLoop])
  useEffect(() => {
    wholeLoopRef.current = wholeLoop
  }, [wholeLoop])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const playIndex = useCallback(
    (index: number, resetLoop = true) => {
      const list = sentencesRef.current
      if (index < 0 || index >= list.length) return
      const sentence = list[index]
      const audio = audioRef.current
      if (!audio) return
      if (!sentence.audio?.url) {
        setPlaying(false)
        optionsRef.current.onMissingAudio?.(index)
        return
      }
      clearTimer()
      if (resetLoop) loopDoneRef.current = 0
      setCurrentIndex(index)
      currentRef.current = index
      audio.src = sentence.audio.url
      audio.playbackRate = rateRef.current
      const media = audio as HTMLAudioElement & {
        preservesPitch?: boolean
        webkitPreservesPitch?: boolean
      }
      media.preservesPitch = true
      if ('webkitPreservesPitch' in media) media.webkitPreservesPitch = true
      setPlaying(true)
      void audio.play().catch((error: unknown) => {
        if ((error as { name?: string })?.name === 'AbortError') return
        setPlaying(false)
        optionsRef.current.onPlayError?.()
      })
    },
    [clearTimer],
  )

  const schedule = useCallback(
    (index: number, delayMs: number) => {
      clearTimer()
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        playIndex(index)
      }, Math.max(0, delayMs))
    },
    [clearTimer, playIndex],
  )

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audioRef.current = audio
    const handleEnded = () => {
      const index = currentRef.current
      const list = sentencesRef.current
      const duration = list[index]?.audio?.durationMs ?? 2500
      const gap =
        modeRef.current === 'continuous'
          ? 300
          : Math.min(8000, Math.max(400, duration * gapFactorRef.current))
      loopDoneRef.current += 1
      if (loopDoneRef.current < sentenceLoopRef.current) {
        schedule(index, Math.min(gap, 1200))
        return
      }
      loopDoneRef.current = 0
      if (index + 1 < list.length) {
        schedule(index + 1, gap)
      } else if (wholeLoopRef.current && list.length > 0) {
        schedule(0, gap)
      } else {
        setPlaying(false)
      }
    }
    audio.addEventListener('ended', handleEnded)
    return () => {
      audio.removeEventListener('ended', handleEnded)
      audio.pause()
      audio.src = ''
      audioRef.current = null
      clearTimer()
    }
  }, [clearTimer, schedule])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      clearTimer()
      setPlaying(false)
      return
    }
    const current = sentencesRef.current[currentRef.current]
    if (!audio.src || (current?.audio?.url && !audio.src.endsWith(current.audio.url))) {
      playIndex(currentRef.current)
      return
    }
    audio.playbackRate = rateRef.current
    setPlaying(true)
    void audio.play().catch(() => {
      setPlaying(false)
      optionsRef.current.onPlayError?.()
    })
  }, [clearTimer, playIndex, playing])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    clearTimer()
    setPlaying(false)
  }, [clearTimer])

  const stop = useCallback(() => {
    pause()
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    setCurrentIndex(0)
    currentRef.current = 0
    loopDoneRef.current = 0
  }, [pause])

  const next = useCallback(() => {
    playIndex(Math.min(sentencesRef.current.length - 1, currentRef.current + 1))
  }, [playIndex])

  const prev = useCallback(() => {
    playIndex(Math.max(0, currentRef.current - 1))
  }, [playIndex])

  const replay = useCallback(() => {
    playIndex(currentRef.current)
  }, [playIndex])

  const seek = useCallback(
    (index: number) => {
      playIndex(index)
    },
    [playIndex],
  )

  const setRate = useCallback((value: number) => {
    setRateState(value)
    rateRef.current = value
    if (audioRef.current) audioRef.current.playbackRate = value
  }, [])

  const setMode = useCallback((value: PlayMode) => {
    setModeState(value)
    modeRef.current = value
  }, [])

  const setGapFactor = useCallback((value: number) => {
    setGapFactorState(value)
    gapFactorRef.current = value
  }, [])

  const setSentenceLoop = useCallback((value: number) => {
    setSentenceLoopState(value)
    sentenceLoopRef.current = value
  }, [])

  const setWholeLoop = useCallback((value: boolean) => {
    setWholeLoopState(value)
    wholeLoopRef.current = value
  }, [])

  const totalDuration = useMemo(
    () => sentences.reduce((sum, sentence) => sum + (sentence.audio?.durationMs ?? 0), 0),
    [sentences],
  )
  const currentDuration = sentences[currentIndex]?.audio?.durationMs ?? 0

  return {
    currentIndex,
    playing,
    rate,
    mode,
    gapFactor,
    sentenceLoop,
    wholeLoop,
    totalDuration,
    currentDuration,
    currentSentence: sentences[currentIndex]?.text ?? '',
    playIndex,
    seek,
    toggle,
    pause,
    stop,
    next,
    prev,
    replay,
    setRate,
    setMode,
    setGapFactor,
    setSentenceLoop,
    setWholeLoop,
  }
}

export type SentencePlayer = ReturnType<typeof useSentencePlayer>
