"use client"

import { useLLMSession } from "@/use-llm-session"
import { useMutation, useQuery } from "@tanstack/react-query"
import { FormEvent, useRef, useState, useEffect } from "react"
import {
  MessageType,
  validateMessage,
  type ChunkMessage,
  type MetadataMessage,
  StreamStatus,
} from "@/lib/message-schema"

export default function Home() {
  const { sessionId, regenerateSessionId, clearSessionId } = useLLMSession()

  const [prompt, setPrompt] = useState("")
  const [status, setStatus] = useState<
    "idle" | "loading" | "streaming" | "completed" | "error"
  >("idle")
  const [response, setResponse] = useState("")
  const [chunkCount, setChunkCount] = useState(0)

  const controller = useRef<AbortController | null>(null)
  const responseRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight
    }
  }, [response])

  const { refetch } = useQuery({
    queryKey: ["stream", sessionId],
    queryFn: async () => {
      if (!sessionId) return null

      setResponse("")
      setChunkCount(0)

      const abortController = new AbortController()
      controller.current = abortController

      const res = await fetch(`/api/check-stream?sessionId=${sessionId}`, {
        headers: { "Content-Type": "text/event-stream" },
        signal: controller.current.signal,
      })

      if (!res.body) return null

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()

      let streamContent = ""

      while (true) {
        const { value, done } = await reader.read()

        if (done) break

        if (value) {
          const messages = value.split("\n\n").filter(Boolean)

          for (const message of messages) {
            if (message.startsWith("data: ")) {
              const data = message.slice(6)
              try {
                const parsedData = JSON.parse(data)
                const validatedMessage = validateMessage(parsedData)

                if (!validatedMessage) continue

                switch (validatedMessage.type) {
                  case MessageType.CHUNK:
                    const chunkMessage = validatedMessage as ChunkMessage
                    streamContent += chunkMessage.content
                    setResponse((prev) => prev + chunkMessage.content)
                    setChunkCount((prev) => prev + 1)
                    break

                  case MessageType.METADATA:
                    const metadataMessage = validatedMessage as MetadataMessage

                    if (metadataMessage.status === StreamStatus.COMPLETED) {
                      setStatus("completed")
                    }
                    break

                  case MessageType.ERROR:
                    setStatus("error")
                    break
                }
              } catch (e) {
                console.error("Failed to parse message:", e)
              }
            }
          }
        }
      }

      return streamContent
    },
    enabled: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const { mutate, error } = useMutation({
    mutationFn: async (newSessionId: string) => {
      controller.current?.abort()

      await fetch("/api/llm-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, sessionId: newSessionId }),
      })
    },
    onSuccess: () => {
      setStatus("streaming")
      refetch()
    },
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus("loading")
    const newSessionId = regenerateSessionId()
    mutate(newSessionId)
  }

  const handleReset = () => {
    controller.current?.abort()
    clearSessionId()
    setPrompt("")
    setResponse("")
    setChunkCount(0)
    setStatus("idle")
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-12 sm:p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl tracking-tight font-bold mb-8 text-center">
          Resumable LLM Stream
        </h1>

        <form onSubmit={handleSubmit} className="mb-8">
          <div className="mb-4">
            <label htmlFor="prompt" className="block text-sm font-medium mb-2">
              Enter your prompt:
            </label>
            <textarea
              autoFocus
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full p-2 border border-zinc-700 rounded-md min-h-[100px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              placeholder="Ask the AI something..."
              disabled={status === "loading" || status === "streaming"}
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={status === "loading" || status === "streaming"}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {status === "loading"
                ? "Starting..."
                : status === "streaming"
                  ? "Streaming..."
                  : "Generate Response"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 bg-zinc-600 text-white rounded-md hover:bg-zinc-700"
            >
              Reset
            </button>
          </div>
        </form>

        <div className="mt-8">
          <h2 className="text-xl tracking-tight font-semibold mb-2">
            Response:
          </h2>
          {status === "error" ? (
            <div className="p-4 bg-red-100 border border-red-300 rounded-md text-red-800">
              <p className="font-bold">Error:</p>
              <p>{error?.message}</p>
            </div>
          ) : status === "idle" && !response ? (
            <p className="text-gray-500">
              Enter a prompt and click "Generate Response" to see the AI's
              response.
            </p>
          ) : (
            <div
              ref={responseRef}
              className="flex flex-col h-96 overflow-y-auto p-4 bg-zinc-900 text-zinc-200 border border-zinc-800 rounded-md whitespace-pre-wrap [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:bg-zinc-800"
            >
              <div>{response || "Loading..."}</div>
            </div>
          )}

          {(status === "streaming" || status === "completed") && (
            <div className="mt-2 text-sm text-gray-500">
              <p>Session ID: {sessionId}</p>
              <p>Status: {status}</p>
              <p>Chunks received: {chunkCount}</p>
              <p>
                Connection: {status === "streaming" ? "Active SSE" : "Closed"}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
