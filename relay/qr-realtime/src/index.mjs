import { createRelayServer } from "./server.mjs"

const relay = createRelayServer({
  upstreamBaseUrl: process.env.UPSTREAM_BASE_URL ?? "https://iitrlogger.com",
  tokenSecret: process.env.RELAY_TOKEN_SECRET ?? "",
  publishSecret: process.env.RELAY_PUBLISH_SECRET ?? "",
  port: Number.parseInt(process.env.PORT ?? "8080", 10),
})

await relay.start()
console.log(JSON.stringify({ event: "relay.ready", port: process.env.PORT ?? "8080", protocolVersion: 1 }))

const shutdown = async () => {
  await relay.stop()
  process.exit(0)
}
process.once("SIGTERM", shutdown)
process.once("SIGINT", shutdown)
