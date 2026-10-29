import { subscribeVocabSync } from '@/lib/maimemo/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          )
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
          // already closed
        }
      }
      const unsubscribe = subscribeVocabSync((state) => {
        send('progress', state)
        if (!state.running && (state.phase === 'done' || state.phase === 'error')) {
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
