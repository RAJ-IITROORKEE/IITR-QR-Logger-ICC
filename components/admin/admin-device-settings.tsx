"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle2, Code2, Copy, Cpu, Database, KeyRound, RefreshCw, Router, ShieldAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const API_ENDPOINT = "https://qr-logger-icc.vercel.app/api/qr-biometric-icc"
const DASHBOARD_URL = "https://qr-logger-icc.vercel.app"

type DeviceRecord = {
  id: string
  deviceNumber: string
  name: string
  projectType: string
  location: string
  firmware: string
  apiKeyPreview: string | null
  apiKeyCreatedAt: string | null
  apiKeyLastUsedAt: string | null
  macAddress: string | null
  macAddressLockedAt: string | null
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

type ObservedDevice = {
  deviceId: string
  totalScans: number
  lastSeen: string
  latestState: string
}

type SettingsData = {
  ok: boolean
  registeredDevices: DeviceRecord[]
  observedDevices: ObservedDevice[]
  error: string | null
}

type GeneratedKey = {
  deviceNumber: string
  deviceName: string
  apiKey: string
}

const postPayload = {
  deviceId: "QRB-001",
  apiKey: "PASTE_GENERATED_API_KEY_HERE",
  macAddress: "AA:BB:CC:DD:EE:FF",
  decodedData: "https://dosw.iitr.ac.in/StudentProxy.aspx?id=STUDENT_TOKEN_HERE",
}

const onlinePayload = {
  event: "device-online",
  deviceId: "QRB-001",
  apiKey: "PASTE_GENERATED_API_KEY_HERE",
  macAddress: "AA:BB:CC:DD:EE:FF",
}

const successResponse = {
  success: true,
  module: "qr-biometric-icc",
  endpoint: "/api/qr-biometric-icc",
  deviceId: "QRB-001",
  scanStatus: "success",
  entryState: "IN",
  persistence: { status: "saved" },
}

const invalidKeyResponse = {
  success: false,
  module: "qr-biometric-icc",
  error: "Invalid device ID or API key",
}

function formatDate(value: string | null) {
  if (!value) return "Never"
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-border bg-muted/45 p-4 text-xs leading-6 text-foreground">
      <code>{JSON.stringify(value, null, 2)}</code>
    </pre>
  )
}

async function copyText(value: string) {
  await navigator.clipboard?.writeText(value)
}

export function AdminDeviceSettings({ initialData }: { initialData: SettingsData }) {
  const [devices, setDevices] = useState(initialData.registeredDevices)
  const [deviceName, setDeviceName] = useState("")
  const [generated, setGenerated] = useState<GeneratedKey | null>(null)
  const [error, setError] = useState(initialData.error)
  const [pending, setPending] = useState(false)
  const lockedMacCount = devices.filter((device) => device.macAddress).length

  async function addDevice() {
    const name = deviceName.trim()
    if (!name) return setError("Enter a device name before generating an API key.")

    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const result = (await response.json()) as { success?: boolean; error?: string; device?: DeviceRecord; apiKey?: string }
      if (!response.ok || !result.success || !result.device || !result.apiKey) throw new Error(result.error ?? "Failed to add device")

      setDevices((current) => [result.device as DeviceRecord, ...current])
      setGenerated({ deviceNumber: result.device.deviceNumber, deviceName: result.device.name, apiKey: result.apiKey })
      setDeviceName("")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to add device")
    } finally {
      setPending(false)
    }
  }

  async function regenerateApiKey(device: DeviceRecord) {
    const confirmed = window.confirm(`Regenerate API key for ${device.deviceNumber}? The current key will expire immediately and the Arduino code must be updated.`)
    if (!confirmed) return

    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: device.id, action: "regenerate-api-key" }),
      })
      const result = (await response.json()) as { success?: boolean; error?: string; device?: DeviceRecord; apiKey?: string }
      if (!response.ok || !result.success || !result.device || !result.apiKey) throw new Error(result.error ?? "Failed to regenerate API key")

      setDevices((current) => current.map((item) => (item.id === result.device?.id ? result.device : item)))
      setGenerated({ deviceNumber: result.device.deviceNumber, deviceName: result.device.name, apiKey: result.apiKey })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to regenerate API key")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl border border-orange-500/20 bg-card/75 p-6 shadow-2xl shadow-orange-950/10 backdrop-blur">
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-orange-300">
          <Router className="size-3.5" />
          Settings
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Devices & Secure API Keys</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Add QR Logger ICC devices, generate strong API keys, and paste the generated key into the Arduino code before uploading it to the M5 device.
        </p>
      </section>

      {error ? (
        <Card className="border-red-500/25 bg-red-500/5">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <AlertCircle className="size-5 text-red-300" />
            <div>
              <CardTitle>Action required</CardTitle>
              <CardDescription>{error}</CardDescription>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Registered devices</CardDescription>
            <CardTitle className="font-mono text-3xl">{devices.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>MAC locked devices</CardDescription>
            <CardTitle className="font-mono text-3xl">{lockedMacCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Receiver status</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="size-5 text-emerald-400" />
              Secured
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="size-5 text-orange-300" />
              <CardTitle>Add Device</CardTitle>
            </div>
            <CardDescription>Enter a device name. The system will assign a device ID and generate a one-time API key.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="device-name">Device name</Label>
              <Input id="device-name" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Example: ICC Main Gate Scanner" />
            </div>
            <Button disabled={pending} onClick={() => void addDevice()}>
              <KeyRound className="size-4" />
              Generate API Key
            </Button>
            <div className="rounded-2xl border border-border bg-muted/35 p-4 text-xs leading-5 text-muted-foreground">
              After generation, paste the raw API key into <span className="font-mono text-foreground">const char* API_KEY = &quot;&quot;;</span> in the Arduino sketch and use the assigned <span className="font-mono text-foreground">DEVICE_ID</span>.
              The device will register and lock its WiFi MAC automatically after it connects.
            </div>
          </CardContent>
        </Card>

        {generated ? (
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-5 text-orange-300" />
                <CardTitle>Generated API Key</CardTitle>
              </div>
              <CardDescription>This raw key is shown only now. Copy it before leaving this page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-background/55 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Device ID</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-orange-300">{generated.deviceNumber}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background/55 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Device name</p>
                  <p className="mt-1 text-sm font-semibold">{generated.deviceName}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-background/55 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">API_KEY</p>
                <p className="mt-2 break-all font-mono text-sm text-orange-200">{generated.apiKey}</p>
              </div>
              <Button variant="outline" onClick={() => void copyText(generated.apiKey)}>
                <Copy className="size-4" />
                Copy API Key
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="size-5 text-orange-300" />
              <CardTitle>Registered Devices</CardTitle>
            </div>
            <CardDescription>Regenerate only if a key is leaked or a device is being reprovisioned.</CardDescription>
          </CardHeader>
          <CardContent>
            {devices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No devices registered yet.</div>
            ) : (
              <div className="space-y-3">
                {devices.map((device) => (
                  <div key={device.id} className="rounded-2xl border border-border bg-background/55 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{device.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{device.deviceNumber}</p>
                      </div>
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => void regenerateApiKey(device)}>
                        <RefreshCw className="size-3.5" />
                        Regenerate
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">Key {device.apiKeyPreview ?? "not generated"}</Badge>
                      <Badge variant="outline">Created {formatDate(device.apiKeyCreatedAt)}</Badge>
                      <Badge variant="outline">Last used {formatDate(device.apiKeyLastUsedAt)}</Badge>
                      <Badge variant={device.macAddress ? "default" : "outline"}>{device.macAddress ? "MAC locked" : "MAC pending"}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 rounded-xl border border-border bg-muted/25 p-3 text-xs text-muted-foreground sm:grid-cols-3">
                      <div>
                        <p className="uppercase tracking-[0.16em]">WiFi MAC</p>
                        <p className="mt-1 font-mono text-foreground">{device.macAddress ?? "Waiting for device"}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-[0.16em]">Locked</p>
                        <p className="mt-1 text-foreground">{formatDate(device.macAddressLockedAt)}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-[0.16em]">Last online</p>
                        <p className="mt-1 text-foreground">{formatDate(device.lastSeenAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu className="size-5 text-orange-300" />
              <CardTitle>Current Devices</CardTitle>
            </div>
            <CardDescription>Devices detected from recent QR biometric scans.</CardDescription>
          </CardHeader>
          <CardContent>
            {initialData.observedDevices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No current devices detected yet. Send a secured scan to <span className="font-mono text-foreground">/api/qr-biometric-icc</span> to see a device here.
              </div>
            ) : (
              <div className="space-y-3">
                {initialData.observedDevices.map((device) => (
                  <div key={device.deviceId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/55 p-4">
                    <div>
                      <p className="font-mono text-sm font-semibold">{device.deviceId}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Last seen {formatDate(device.lastSeen)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{device.totalScans} scans</Badge>
                      <Badge className="bg-orange-500 text-black hover:bg-orange-500">{device.latestState}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Router className="size-5 text-orange-300" />
              <CardTitle>Receiver API Endpoint</CardTitle>
            </div>
            <CardDescription>Use this endpoint from the QR biometric hardware.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-2xl border border-border bg-muted/35 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Dashboard URL</p>
              <p className="mt-1 break-all font-mono text-sm">{DASHBOARD_URL}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/35 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Endpoint</p>
              <p className="mt-1 break-all font-mono text-sm text-orange-300">{API_ENDPOINT}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/35 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Headers</p>
              <p className="mt-1 font-mono text-sm">Content-Type: application/json</p>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              The API key can be sent as <span className="font-mono text-foreground">apiKey</span> in JSON or as an <span className="font-mono text-foreground">X-API-Key</span> header. The Arduino code sends both.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code2 className="size-5 text-orange-300" />
              <CardTitle>JSON Format Information</CardTitle>
            </div>
            <CardDescription>Payload and response examples for secure device integration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Online MAC registration</p>
              <JsonBlock value={onlinePayload} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Request body</p>
              <JsonBlock value={postPayload} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Success response</p>
              <JsonBlock value={successResponse} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Invalid key response</p>
              <JsonBlock value={invalidKeyResponse} />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
