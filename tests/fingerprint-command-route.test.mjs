import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"
import vm from "node:vm"

const ROUTE = "./app/api/device/v1/fingerprint/commands/route.ts"

function loadRoute() {
  const source = readFileSync(ROUTE, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const updates = []
  const moduleRequire = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } }
    if (specifier === "@/lib/attendance-device-auth") return { authenticateAttendanceDevice: async () => ({ ok: true, device: { deviceId: "TAB5-001" } }) }
    if (specifier === "@/lib/fingerprint-device-contract") return {
      parseFingerprintCommandAck: (body) => body?.commandId && ["ACKNOWLEDGED", "COMPLETED", "FAILED"].includes(body.status)
        ? { ok: true, value: { commandId: body.commandId, status: body.status, error: body.error ?? null } }
        : { ok: false, error: "Invalid fingerprint command acknowledgement" },
    }
    if (specifier === "@/lib/prisma") {
      const prisma = {
      fingerprintCommand: {
        findMany: async () => [{ commandId: "cmd-1", commandType: "ENROLL", deviceId: "TAB5-001", status: "PENDING", createdAt: new Date("2026-08-05T11:59:08.000Z") }],
        findFirst: async () => ({ commandId: "cmd-1", deviceId: "TAB5-001" }),
        updateMany: async (query) => { updates.push(query); return { count: 1 } },
        update: async (query) => { updates.push(query); return { commandId: query.where.commandId, status: query.data.status } },
      },
      fingerprintEnrollment: {
        findFirst: async () => null,
        update: async () => ({}) ,
      },
      $transaction: async (operation) => operation(prisma),
      }
      return { prisma }
    }
    throw new Error(`Unexpected module: ${specifier}`)
  }
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, {
    Date,
    Response,
    URL,
    console: { error() {} },
    exports: cjsModule.exports,
    module: cjsModule,
    require: moduleRequire,
  }, { filename: ROUTE })
  return { GET: cjsModule.exports.GET, POST: cjsModule.exports.POST, updates }
}

test("authenticated fingerprint command polling returns device-scoped commands", async () => {
  const { GET } = loadRoute()
  const response = await GET(new Request("https://device.test/api/device/v1/fingerprint/commands"))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.success, true)
  assert.equal(body.commands[0].commandId, "cmd-1")
})

test("authenticated fingerprint command acknowledgement updates the command", async () => {
  const { POST, updates } = loadRoute()
  const response = await POST(new Request("https://device.test/api/device/v1/fingerprint/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ commandId: "cmd-1", status: "COMPLETED" }),
  }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).status, "COMPLETED")
  assert.equal(updates.length, 1)
})
