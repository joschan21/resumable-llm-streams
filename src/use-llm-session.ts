import { useState, useEffect, useCallback } from "react"
import { customAlphabet } from "nanoid"
import { useRouter } from "next/navigation"

export const useLLMSession = () => {
  const [sessionId, setSessionId] = useState<string>("")
  const router = useRouter()
  const nanoid = customAlphabet("0123456789", 6)

  const updateUrlWithSessionId = useCallback(
    (id: string) => {
      const url = new URL(window.location.href)
      url.searchParams.set("sessionId", id)
      router.replace(url.toString(), { scroll: false })
    },
    [router]
  )

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const urlSessionId = urlParams.get("sessionId")
    const storedSessionId = localStorage.getItem("llm-session-id")

    if (urlSessionId) {
      localStorage.setItem("llm-session-id", urlSessionId)
      setSessionId(urlSessionId)
    } else if (storedSessionId) {
      setSessionId(storedSessionId)
      updateUrlWithSessionId(storedSessionId)
    } else {
      const newSessionId = nanoid()
      localStorage.setItem("llm-session-id", newSessionId)
      setSessionId(newSessionId)
      updateUrlWithSessionId(newSessionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearSessionId = useCallback(() => {
    localStorage.removeItem("llm-session-id")
    setSessionId("")
    const url = new URL(window.location.href)
    url.searchParams.delete("sessionId")
    router.replace(url.toString(), { scroll: false })
  }, [router])

  const regenerateSessionId = () => {
    const newSessionId = nanoid()
    localStorage.setItem("llm-session-id", newSessionId)
    setSessionId(newSessionId)
    updateUrlWithSessionId(newSessionId)
    return newSessionId
  }

  return {
    sessionId,
    regenerateSessionId,
    clearSessionId,
  }
}
