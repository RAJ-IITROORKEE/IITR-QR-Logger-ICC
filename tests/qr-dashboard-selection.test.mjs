import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"
import * as jsx from "react/jsx-runtime"

const reading = (id) => ({ id, deviceId: "TEST-QR", timestamp: "2026-08-05T10:00:00Z", entryState: "IN", studentInfo: { fullName: id, enrollmentNo: `TEST${id}` } })
const response = (latest, changeSequence = "1") => ({ latest, readings: [], stats: {}, health: { status: "online", lastSeenSeconds: 0 }, pagination: { page: 1, totalPages: 1 }, changeSequence })

function nodes(node) {
  if (!node || typeof node !== "object") return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}

function text(node) {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(text).join("")
  return text(node?.props?.children ?? "")
}

function dashboard() {
  const state = [], effects = [], timers = []
  let index = 0, firstRender = true
  const responses = []
  const fetchCalls = []
  const react = {
    useState(initial) {
      const slot = index++
      if (firstRender) state[slot] = initial
      return [state[slot], (value) => { state[slot] = typeof value === "function" ? value(state[slot]) : value }]
    },
    useRef(initial) { return react.useState({ current: initial })[0] },
    useCallback: (fn) => fn,
    useEffectEvent: (fn) => fn,
    useEffect: (fn) => { if (firstRender) effects.push(fn) },
  }
  const source = readFileSync("./components/qr-biometric/qr-biometric-dashboard.tsx", "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const cjsModule = { exports: {} }
  vm.runInNewContext(compiled, {
    exports: cjsModule.exports, module: cjsModule, AbortController, URLSearchParams, Date, console, crypto,
    document: { visibilityState: "visible" },
    window: { setTimeout: (fn, delay = 0) => { timers.push({ fn, delay }); return timers.length }, setInterval: () => 0 },
    fetch: (url, options) => {
      fetchCalls.push({ url, options })
      assert.ok(responses.length, "unexpected fetch")
      const next = responses.shift()
      return typeof next === "function" ? next(url, options) : Promise.resolve({ ok: true, json: async () => next })
    },
    require: (specifier) => {
      if (specifier === "react") return react
      if (specifier === "react/jsx-runtime") return jsx
       if (specifier === "sonner") return { toast: { success() {}, error() {} } }
       if (specifier === "@/hooks/use-qr-realtime-updates") return { useQrRealtimeUpdates: () => {} }
       if (specifier.includes("qr-student-scan-details")) return { QrStudentAvatar: "Avatar", QrEntryStateBadge: "Badge", QrStudentSummary: "Summary", qrStudentDisplayName: (item) => item.studentInfo.fullName }
      if (specifier === "lucide-react" || specifier.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, key) => String(key) })
      throw new Error(`Unexpected module: ${specifier}`)
    },
  })
  const render = () => { index = 0; const tree = cjsModule.exports.QrBiometricDashboard(); firstRender = false; return tree }
  render()
  effects.forEach((effect) => effect())
  const settle = async () => { await new Promise((resolve) => setImmediate(resolve)) }
  const runTimer = async (timer) => { timer.fn(); await settle() }
  return {
    render,
    responses,
    settle,
    timers,
    fetchCalls,
    load: async (data) => { responses.push(data); await runTimer(timers[0]) },
    poll: async () => runTimer(timers[1]),
    runTimer,
  }
}

test("manual preview and submission never pin the live latest card", async () => {
  const ui = dashboard()
  await ui.load(response(reading("live-first")))
  let tree = ui.render()
  nodes(tree).find((node) => node.type === "Button" && text(node) === "Manual").props.onClick()
  tree = ui.render()
  nodes(tree).find((node) => node.props?.id === "manual-enrollment").props.onChange({ target: { value: "TESTMANUAL" } })
  tree = ui.render()
  ui.responses.push({ ...response(reading("lookup-latest")), manualLookup: { reading: reading("manual-preview"), currentStatus: "IN", defaultEntryState: "OUT" } })
  await nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} })
  tree = ui.render()
  const liveCard = () => nodes(tree).find((node) => node.type === "section" && text(node).includes("QRBiometric Live Feed"))
  assert.match(text(liveCard()), /live-first/)
  assert.match(text(nodes(tree).find((node) => node.type === "Dialog")), /manual-preview/)

  ui.responses.push({ success: true, received: reading("manual-result"), entryState: "OUT" }, response(reading("live-newer")))
  await nodes(tree).find((node) => node.type === "Button" && text(node) === "Mark OUT").props.onClick()
  await ui.settle()
  tree = ui.render()
  assert.match(text(liveCard()), /live-newer/)
  assert.doesNotMatch(text(liveCard()), /manual-result/)
  assert.match(text(tree), /Last manual submission/)
  assert.match(text(tree), /manual-result/)

  ui.responses.push(response(null))
  nodes(tree).find((node) => node.type === "Button" && text(node) === "Refresh").props.onClick()
  await ui.settle()
  tree = ui.render()
  assert.doesNotMatch(text(liveCard()), /manual-result|live-newer/)
})

test("change refresh coalesces with an in-flight dashboard request for the same filters", async () => {
  const ui = dashboard()
  await ui.load(response(reading("baseline")))

  let resolveDashboard
  ui.responses.push(() => new Promise((resolve) => {
    resolveDashboard = () => resolve({ ok: true, json: async () => response(reading("refreshed"), "2") })
  }))
  let tree = ui.render()
  nodes(tree).find((node) => node.type === "Button" && text(node) === "Refresh").props.onClick()
  await ui.settle()

  const dashboardRequests = () => ui.fetchCalls.filter(({ url }) => url.startsWith("/api/qr-biometric-icc?"))
  const inFlightRequest = dashboardRequests().at(-1)
  assert.equal(dashboardRequests().length, 2)

  ui.responses.push({ success: true, sequence: "2" })
  await ui.poll()

  assert.equal(dashboardRequests().length, 2)
  assert.equal(inFlightRequest.options.signal.aborted, false)

  resolveDashboard()
  await ui.settle()
  await ui.settle()
  tree = ui.render()
  assert.match(text(nodes(tree).find((node) => node.type === "section" && text(node).includes("QRBiometric Live Feed"))), /refreshed/)
})

test("a failed change refresh retries on the normal change polling cadence", async () => {
  const ui = dashboard()
  await ui.load(response(reading("baseline")))

  ui.responses.push(
    { success: true, sequence: "2" },
    { ok: false, status: 503, json: async () => ({ error: "Dashboard unavailable" }) },
  )
  await ui.poll()
  await ui.settle()

  const retry = ui.timers.at(-1)
  assert.equal(retry.delay, 1500)

  ui.responses.push({ success: true, sequence: "2" }, response(reading("recovered"), "2"))
  await ui.runTimer(retry)
  await ui.settle()

  const dashboardRequests = ui.fetchCalls.filter(({ url }) => url.startsWith("/api/qr-biometric-icc?"))
  assert.equal(dashboardRequests.length, 3)
  const tree = ui.render()
  assert.match(text(nodes(tree).find((node) => node.type === "section" && text(node).includes("QRBiometric Live Feed"))), /recovered/)
})
