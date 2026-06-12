"use client"

import { FormEvent, useState } from "react"
import { AlertCircle, CheckCircle2, KeyRound, Pencil, Save, ShieldCheck, UserPlus, UsersRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type AccessRole = "staff" | "professor" | "super-admin"

type AccessAccount = {
  id: string
  role: string
  name: string
  username: string
  createdAt: string
  updatedAt: string
}

type AccessForm = {
  role: AccessRole
  name: string
  username: string
  password: string
}

const emptyForm: AccessForm = { role: "staff", name: "", username: "", password: "" }

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function roleLabel(role: string) {
  if (role === "super-admin") return "Super Admin"
  return role === "professor" ? "Professor" : "Staff"
}

export function AdminAccessManager({ initialAccounts, initialError }: { initialAccounts: AccessAccount[]; initialError: string | null }) {
  const [accounts, setAccounts] = useState(initialAccounts)
  const [form, setForm] = useState<AccessForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<AccessForm>(emptyForm)
  const [error, setError] = useState(initialError)
  const [success, setSuccess] = useState("")
  const [pending, setPending] = useState(false)

  function startEdit(account: AccessAccount) {
    setEditingId(account.id)
    setEditForm({ role: account.role === "professor" ? "professor" : "staff", name: account.name, username: account.username, password: "" })
    setError(null)
    setSuccess("")
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setSuccess("")

    try {
      const response = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const result = (await response.json()) as { success?: boolean; error?: string; account?: AccessAccount }
      if (!response.ok || !result.success || !result.account) throw new Error(result.error ?? "Failed to create access account")

      setAccounts((current) => [result.account as AccessAccount, ...current])
      setForm(emptyForm)
      setSuccess("Access account created.")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create access account")
    } finally {
      setPending(false)
    }
  }

  async function updateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingId) return
    setPending(true)
    setError(null)
    setSuccess("")

    try {
      const response = await fetch("/api/admin/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...editForm }),
      })
      const result = (await response.json()) as { success?: boolean; error?: string; account?: AccessAccount }
      if (!response.ok || !result.success || !result.account) throw new Error(result.error ?? "Failed to update access account")

      setAccounts((current) => current.map((account) => (account.id === result.account?.id ? result.account : account)))
      setEditingId(null)
      setEditForm(emptyForm)
      setSuccess("Access account updated.")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update access account")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl border border-orange-500/20 bg-card/75 p-6 shadow-2xl shadow-orange-950/10 backdrop-blur">
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-orange-300">
          <ShieldCheck className="size-3.5" />
          Access Control
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Staff & Professor Access</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Create and update dashboard login accounts. These credentials are required before anyone can view the live QR logger at the public URL.</p>
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

      {success ? (
        <Card className="border-emerald-500/25 bg-emerald-500/5">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <CheckCircle2 className="size-5 text-emerald-300" />
            <div>
              <CardTitle>Saved</CardTitle>
              <CardDescription>{success}</CardDescription>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total access accounts</CardDescription>
            <CardTitle className="font-mono text-3xl">{accounts.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Staff accounts</CardDescription>
            <CardTitle className="font-mono text-3xl">{accounts.filter((account) => account.role === "staff").length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Super admin accounts</CardDescription>
            <CardTitle className="font-mono text-3xl">{accounts.filter((account) => account.role === "super-admin").length}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="size-5 text-orange-300" />
              <CardTitle>Create Access Point</CardTitle>
            </div>
            <CardDescription>Add a staff or professor credential for dashboard login.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={createAccount}>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(value) => setForm((current) => ({ ...current, role: value as AccessRole }))}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="professor">Professor</SelectItem>
                    <SelectItem value="super-admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="access-name">Name</Label>
                <Input id="access-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Example: ICC Gate Staff" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="access-username">Set username</Label>
                <Input id="access-username" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} placeholder="icc-staff-4" autoComplete="off" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="access-password">Set password</Label>
                <Input id="access-password" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" required />
              </div>
              <Button disabled={pending} className="bg-orange-500 text-black hover:bg-orange-400">
                <KeyRound className="size-4" />
                Create Access
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UsersRound className="size-5 text-orange-300" />
              <CardTitle>Access Accounts</CardTitle>
            </div>
            <CardDescription>Update role, name, username, or password. Leave password blank while editing to keep the current password.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.length === 0 ? (
              <div className="rounded-2xl border border-border bg-muted/35 p-6 text-center text-sm text-muted-foreground">No access accounts found.</div>
            ) : (
              accounts.map((account) => (
                <div key={account.id} className="rounded-2xl border border-border bg-background/55 p-4">
                  {editingId === account.id ? (
                    <form className="grid gap-3 lg:grid-cols-[0.85fr_1fr_1fr_1fr_auto] lg:items-end" onSubmit={updateAccount}>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={editForm.role} onValueChange={(value) => setEditForm((current) => ({ ...current, role: value as AccessRole }))}>
                          <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="professor">Professor</SelectItem>
                            <SelectItem value="super-admin">Super Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Username</Label>
                        <Input value={editForm.username} onChange={(event) => setEditForm((current) => ({ ...current, username: event.target.value }))} required />
                      </div>
                      <div className="space-y-2">
                        <Label>New password</Label>
                        <Input type="password" value={editForm.password} onChange={(event) => setEditForm((current) => ({ ...current, password: event.target.value }))} placeholder="Leave blank" autoComplete="new-password" />
                      </div>
                      <div className="flex gap-2">
                        <Button disabled={pending} size="sm" className="bg-orange-500 text-black hover:bg-orange-400"><Save className="size-4" />Save</Button>
                        <Button type="button" disabled={pending} size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{account.name}</p>
                          <Badge variant="outline" className="border-orange-500/30 text-orange-300">{roleLabel(account.role)}</Badge>
                        </div>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{account.username}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Updated {formatDate(account.updatedAt)}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => startEdit(account)}>
                        <Pencil className="size-4" />
                        Update
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
