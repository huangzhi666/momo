import { VOICES } from '@/lib/constants'
import { jsonError } from '@/lib/api'
import { getArticleRow } from '@/lib/db/queries'
import { AppError } from '@/lib/errors'
import { getTtsJobState, subscribeTts } from '@/lib/tts/job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function resolveVoice(value: string | null): string {
  if (value && VOICES.some((voice) => voice.id === value)) return value
  return 'female-us'
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!getArticleRow(id)) {
    return jsonError(new AppError('NOT_FOUND', '文章不存在', 404))
  }
  const voice = resolveVoice(new URL(request.url).searchParams.get('voice'))
  const initial = getTtsJobState(id, voice)
  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }
      const close = () => {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          // closed
        }
      }

      if (initial.status === 'idle') {
        send('progress', initial)
        send('done', initial)
        setTimeout(close, 60)
        cleanup = close
        return
      }

      const unsubscribe = subscribeTts(id, voice, (state) => {
        send('progress', state)
        if (state.status !== 'running') {
          send('done', state)
          setTimeout(close, 80)
        }
      })
      const heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          closed = true
        }
      }, 15_000)
      cleanup = () => {
        clearInterval(heartbeat)
        unsubscribe()
        close()
      }
      request.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
