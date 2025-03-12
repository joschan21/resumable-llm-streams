import { redis } from "@/utils"
import { nanoid } from "nanoid"
import { NextRequest, NextResponse } from "next/server"
import {
  validateMessage,
  MessageType,
  type ErrorMessage,
} from "@/lib/message-schema"

export const dynamic = "force-dynamic"
export const maxDuration = 60
export const runtime = "nodejs"

type StreamField = string
type StreamMessage = [string, StreamField[]]
type StreamData = [string, StreamMessage[]]

const arrToObj = (arr: StreamField[]) => {
  const obj: Record<string, string> = {}

  for (let i = 0; i < arr.length; i += 2) {
    obj[arr[i]] = arr[i + 1]
  }

  return obj
}

const json = (data: Record<string, unknown>) => {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("sessionId")

  if (!sessionId) {
    return NextResponse.json(
      { error: "Stream key is required" },
      { status: 400 }
    )
  }

  const streamKey = `llm:stream:${sessionId}`
  const groupName = `sse-group-${nanoid()}`

  const keyExists = await redis.exists(streamKey)

  if (!keyExists) {
    return NextResponse.json(
      { error: "Stream does not (yet) exist" },
      { status: 412 }
    )
  }

  try {
    await redis.xgroup(streamKey, {
      type: "CREATE",
      group: groupName,
      id: "0",
    })
  } catch (_err) {}

  const response = new Response(
    new ReadableStream({
      async start(controller) {
        const readStreamMessages = async () => {
          const chunks = (await redis.xreadgroup(
            groupName,
            `consumer-1`,
            streamKey,
            ">"
          )) as StreamData[]

          if (chunks?.length > 0) {
            const [_streamKey, messages] = chunks[0]
            for (const [_messageId, fields] of messages) {
              const rawObj = arrToObj(fields)
              const validatedMessage = validateMessage(rawObj)

              if (validatedMessage) {
                controller.enqueue(json(validatedMessage))
              }
            }
          }
        }

        await readStreamMessages()

        const subscription = redis.subscribe(streamKey)

        subscription.on("message", async () => {
          await readStreamMessages()
        })

        subscription.on("error", (error) => {
          console.error(`SSE subscription error on ${streamKey}:`, error)

          const errorMessage: ErrorMessage = {
            type: MessageType.ERROR,
            error: error.message,
          }

          controller.enqueue(json(errorMessage))
          controller.close()
        })

        req.signal.addEventListener("abort", () => {
          console.log("Client disconnected, cleaning up subscription")
          subscription.unsubscribe()
          controller.close()
        })
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    }
  )

  return response
}
