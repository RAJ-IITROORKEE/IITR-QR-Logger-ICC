"use client"

import { FormEvent, useState } from "react"
import { CheckCircle2, LifeBuoy, Loader2, Mail, MessageSquare, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PublicShell } from "@/components/site/public-shell"

export default function SupportPage() {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const form = event.currentTarget
    const formData = new FormData(form)
    const payload = {
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      subject: String(formData.get("subject") ?? "").trim(),
      message: String(formData.get("message") ?? "").trim(),
    }

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(result?.error ?? "Unable to submit support request")

      form.reset()
      setSubmitted(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to submit support request")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicShell>
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <section className="rounded-3xl border border-orange-500/20 bg-card/75 p-6 md:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10 text-orange-300">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight">Support</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Raise an issue, enquiry, or operational request for the QR-BIOMETRIC-CC system. Submissions are routed to the admin support inbox for review and follow-up.
          </p>
          <div className="mt-8 grid gap-3">
            {[
              [Mail, "Email follow-up", "Use an active email so the admin team can respond."],
              [MessageSquare, "Clear context", "Mention the device, scan issue, dashboard screen, or export period."],
              [CheckCircle2, "Tracked status", "Requests are reviewed from the admin support section."],
            ].map(([Icon, title, text]) => (
              <div key={String(title)} className="rounded-xl border border-border bg-background/45 p-4">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 text-orange-300" />
                  <div>
                    <p className="text-sm font-semibold">{String(title)}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{String(text)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card/75 p-6 md:p-8">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300">Request Form</p>
            <h2 className="mt-2 text-2xl font-semibold">Submit an enquiry</h2>
          </div>

          {submitted ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" />
              <p className="mt-4 text-lg font-semibold">Support request submitted</p>
              <p className="mt-2 text-sm text-muted-foreground">The admin team can now review it from the support inbox.</p>
              <Button className="mt-5" variant="outline" onClick={() => setSubmitted(false)}>
                Submit another
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  Name
                  <input name="name" required disabled={submitting} className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" placeholder="Your name" />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Email
                  <input name="email" type="email" required disabled={submitting} className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" placeholder="you@example.com" />
                </label>
              </div>
              <label className="space-y-2 text-sm font-medium">
                Subject
                <input name="subject" required disabled={submitting} className="w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" placeholder="Issue or enquiry title" />
              </label>
              <label className="space-y-2 text-sm font-medium">
                Message
                <textarea name="message" required disabled={submitting} rows={7} className="w-full resize-none rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" placeholder="Describe what happened or what support you need..." />
              </label>
              {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? "Submitting..." : "Submit request"}
              </Button>
            </form>
          )}
        </section>
      </main>
    </PublicShell>
  )
}
