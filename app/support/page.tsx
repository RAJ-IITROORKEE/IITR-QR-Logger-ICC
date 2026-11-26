"use client"

import { FormEvent, useState } from "react"
import { CheckCircle2, LifeBuoy, Loader2, Mail, MessageSquare, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
      <main className="frame-section grid w-full flex-1 gap-6 py-12 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="panel reveal p-6 md:p-8">
          <div className="flex size-[42px] items-center justify-center rounded-md border border-border bg-muted text-brand">
            <LifeBuoy className="h-5 w-5" />
          </div>
          <h1 className="type-h2 mt-6">Support</h1>
          <p className="type-lede mt-4 text-muted-foreground">
            Raise an issue, enquiry, or operational request for the QR LOGGER ICC system. Submissions are routed to the admin support inbox for review and follow-up.
          </p>
          <div className="mt-8 grid gap-3">
            {[
              [Mail, "Email follow-up", "Use an active email so the admin team can respond."],
              [MessageSquare, "Clear context", "Mention the device, scan issue, dashboard screen, or export period."],
              [CheckCircle2, "Tracked status", "Requests are reviewed from the admin support section."],
            ].map(([Icon, title, text]) => (
              <div key={String(title)} className="tile p-4">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 text-brand" />
                  <div>
                    <p className="text-sm font-semibold">{String(title)}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{String(text)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel reveal p-6 md:p-8">
          <div className="mb-6">
            <p className="eyebrow">Request Form</p>
            <h2 className="mt-2 text-2xl font-semibold">Submit an enquiry</h2>
          </div>

          {submitted ? (
            <div className="rounded-lg border border-active-border bg-active-surface p-8 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-active" />
              <p className="mt-4 text-lg font-semibold">Support request submitted</p>
              <p className="mt-2 text-sm text-muted-foreground">The admin team can now review it from the support inbox.</p>
              <Button className="mt-5" variant="outline" onClick={() => setSubmitted(false)}>
                Submit another
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2 text-sm font-medium">
                  Name
                  <Input name="name" required disabled={submitting} placeholder="Your name" />
                </label>
                <label className="block space-y-2 text-sm font-medium">
                  Email
                  <Input name="email" type="email" required disabled={submitting} placeholder="you@example.com" />
                </label>
              </div>
              <label className="block space-y-2 text-sm font-medium">
                Subject
                <Input name="subject" required disabled={submitting} placeholder="Issue or enquiry title" />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                Message
                <textarea name="message" required disabled={submitting} rows={7} className="w-full resize-none rounded-md border border-input bg-muted px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50" placeholder="Describe what happened or what support you need..." />
              </label>
              {error && <p className="rounded-lg border border-offline-border bg-offline-surface p-3 text-sm text-offline">{error}</p>}
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
