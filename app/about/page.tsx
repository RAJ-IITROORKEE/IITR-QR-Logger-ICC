import { Cpu, GraduationCap, ShieldCheck, Sparkles } from "lucide-react"

import { PublicShell } from "@/components/site/public-shell"

const features = [
  "Live QR biometric entry and exit logging for ICC deployment workflows.",
  "Dark orange mono-theme dashboard focused on fast operational visibility.",
  "Student-centric log views for scan state, device health, and timeline review.",
  "Admin-ready reporting with logs, analytics, exports, and support tracking.",
]

export default function AboutPage() {
  return (
    <PublicShell>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-orange-500/20 bg-card/70 p-6 shadow-2xl shadow-orange-950/20 backdrop-blur md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-orange-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            ICC Implementation
          </div>
          <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            About QR-BIOMETRIC-CC
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            QR-BIOMETRIC-CC is a dedicated QR biometric logger system implemented in ICC (Institute Computer Center), IIT Roorkee. It is designed to make student scan activity visible, organized, and exportable through a focused dashboard experience.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card/75 p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-orange-500/25 bg-orange-500/10 text-orange-300">
              <Cpu className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold">Purpose</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The project supports reliable student movement logging through QR biometric devices and gives ICC operators a clean, real-time interface for monitoring, review, support, and administrative reporting.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card/75 p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-orange-500/25 bg-orange-500/10 text-orange-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold">Implementation</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The system is implemented as a full-stack dashboard with live scan intake, structured log storage, support management, and admin analytics. The visual language is intentionally minimal, dark, and orange to match the QR biometric device interface.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/75 p-6">
          <h2 className="text-xl font-semibold">Features</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {features.map((feature) => (
              <div key={feature} className="rounded-xl border border-orange-500/15 bg-orange-500/5 p-4 text-sm text-muted-foreground">
                {feature}
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10 text-lg font-bold text-orange-300">
                RR
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-orange-300">Designed and Developed by</p>
                <h3 className="mt-1 text-lg font-semibold">RAJ RABIDAS</h3>
                <p className="text-sm text-muted-foreground">B.Tech 3rd Year, IIT Roorkee</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Department of Metallurgical and Materials Engineering, Indian Institute of Technology Roorkee.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card/75 p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted text-orange-300">
                <GraduationCap className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Mentor / Supervisor</p>
                <h3 className="mt-1 text-lg font-semibold">Prof. Rahul Thakur</h3>
                <p className="text-sm text-muted-foreground">Department of CSE, IIT Roorkee</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  )
}
