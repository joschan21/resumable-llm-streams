import { serve } from "@upstash/workflow/nextjs"
import { openai } from "@ai-sdk/openai"
import { streamText } from "ai"
import { redis } from "@/utils"
import {
  MessageType,
  StreamStatus,
  type ChunkMessage,
  type MetadataMessage,
} from "@/lib/message-schema"

interface LLMStreamResponse {
  success: boolean
  sessionId: string
  totalChunks: number
  fullContent: string
}

export const { POST } = serve(async (context) => {
  const { prompt, sessionId } = context.requestPayload as {
    prompt?: string
    sessionId?: string
  }

  if (!prompt || !sessionId) {
    throw new Error("Prompt and sessionId are required")
  }

  const streamKey = `llm:stream:${sessionId}`

  await context.run("mark-stream-start", async () => {
    const metadataMessage: MetadataMessage = {
      type: MessageType.METADATA,
      status: StreamStatus.STARTED,
      completedAt: new Date().toISOString(),
      totalChunks: 0,
      fullContent: "",
    }

    await redis.xadd(streamKey, "*", metadataMessage)
    await redis.publish(streamKey, { type: MessageType.METADATA })
  })

  const res = await context.run("generate-llm-response", async () => {
    const result = await new Promise<LLMStreamResponse>(
      async (resolve, reject) => {
        let fullContent = ""
        let chunkIndex = 0

        const { textStream } = streamText({
          model: openai("gpt-4o"),
          prompt,
          onError: (err) => reject(err),
          onFinish: async () => {
            resolve({
              success: true,
              sessionId,
              totalChunks: chunkIndex,
              fullContent,
            })
          },
        })

        for await (const chunk of textStream) {
          if (chunk) {
            fullContent += chunk
            chunkIndex++

            const chunkMessage: ChunkMessage = {
              type: MessageType.CHUNK,
              content: chunk,
            }

            await redis.xadd(streamKey, "*", chunkMessage)
            await redis.publish(streamKey, { type: MessageType.CHUNK })
          }
        }
      }
    )

    return result
  })

  await context.run("mark-stream-end", async () => {
    const metadataMessage: MetadataMessage = {
      type: MessageType.METADATA,
      status: StreamStatus.COMPLETED,
      completedAt: new Date().toISOString(),
      totalChunks: res.totalChunks,
      fullContent: res.fullContent,
    }

    await redis.xadd(streamKey, "*", metadataMessage)
    await redis.publish(streamKey, { type: MessageType.METADATA })
  })
})
