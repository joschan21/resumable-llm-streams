import { z } from "zod"

export const MessageType = {
  CHUNK: "chunk",
  METADATA: "metadata",
  EVENT: "event",
  ERROR: "error",
} as const

export const StreamStatus = {
  STARTED: "started",
  STREAMING: "streaming",
  COMPLETED: "completed",
  ERROR: "error",
} as const

export const baseMessageSchema = z.object({
  type: z.enum([
    MessageType.CHUNK,
    MessageType.METADATA,
    MessageType.EVENT,
    MessageType.ERROR,
  ]),
})

export const chunkMessageSchema = baseMessageSchema.extend({
  type: z.literal(MessageType.CHUNK),
  content: z.string(),
})

export const metadataMessageSchema = baseMessageSchema.extend({
  type: z.literal(MessageType.METADATA),
  status: z.enum([
    StreamStatus.STARTED,
    StreamStatus.STREAMING,
    StreamStatus.COMPLETED,
    StreamStatus.ERROR,
  ]),
  completedAt: z.string().optional(),
  totalChunks: z.number().optional(),
  fullContent: z.string().optional(),
  error: z.string().optional(),
})

export const eventMessageSchema = baseMessageSchema.extend({
  type: z.literal(MessageType.EVENT),
})

export const errorMessageSchema = baseMessageSchema.extend({
  type: z.literal(MessageType.ERROR),
  error: z.string(),
})

export const messageSchema = z.discriminatedUnion("type", [
  chunkMessageSchema,
  metadataMessageSchema,
  eventMessageSchema,
  errorMessageSchema,
])

export type Message = z.infer<typeof messageSchema>
export type ChunkMessage = z.infer<typeof chunkMessageSchema>
export type MetadataMessage = z.infer<typeof metadataMessageSchema>
export type EventMessage = z.infer<typeof eventMessageSchema>
export type ErrorMessage = z.infer<typeof errorMessageSchema>

export const validateMessage = (data: unknown): Message | null => {
  const result = messageSchema.safeParse(data)
  return result.success ? result.data : null
}
