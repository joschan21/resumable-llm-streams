import { redis } from "@/utils"
import { NextRequest } from "next/server"

export async function GET(_request: NextRequest) {
  await redis.xgroup("llm:stream:04138", {
    type: "CREATE",
    group: "my-sse-group",
    id: "0",
  })

  // 1, 2, 3, 4, 5, 6
  // const res = await redis.xreadgroup(
  //   "sse-group-1",
  //   "consumer-1",
  //   "llm:stream:Rzh41Hl26H",
  //   "1741690661373",
  //   { count: 2 }
  // )

  const res = await redis.xreadgroup(
    `my-sse-group`,
    `consumer-1`,
    "llm:stream:04138",
    "0"
  )

  console.log("res", JSON.stringify(res, null, 2))

  return new Response("OK")
}
