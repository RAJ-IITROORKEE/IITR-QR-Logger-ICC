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
            About QR LOGGER ICC
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            QR LOGGER ICC is a dedicated QR biometric logger system implemented in ICC (Institute Computer Center), IIT Roorkee. It is designed to make student scan activity visible, organized, and exportable through a focused dashboard experience.
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

        <section className="grid gap-5 md:grid-cols-2">
  {/* Developer Card */}
  <div className="relative overflow-hidden rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-card/80 to-card p-6 shadow-xl shadow-orange-950/20">
    <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-orange-500/10 blur-3xl" />

    <div className="relative flex items-start gap-5">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10 text-xl font-bold tracking-wide text-orange-300 shadow-inner shadow-orange-950/30">
        RR
      </div>

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300">
          Designed & Developed by
        </p>

        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          RAJ RABIDAS
        </h3>

        <p className="mt-1 text-sm font-medium text-orange-300">
          PowerGrid Centre of Excellence
        </p>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          B.Tech 3rd Year, Department of Metallurgical and Materials Engineering,
          Indian Institute of Technology Roorkee.
        </p>
      </div>
    </div>

   
  </div>

  {/* Mentor / Supervisor Card */}
 {/* Mentor / Supervisor Card */}
<div className="relative overflow-hidden rounded-3xl border border-border bg-card/75 p-6 shadow-xl shadow-orange-950/10">
  <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-orange-500/5 blur-3xl" />

  <div className="relative flex items-start gap-5">
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-orange-500/25 bg-orange-500/10 text-orange-300 shadow-inner shadow-orange-950/20">
      <GraduationCap className="h-8 w-8" />
    </div>

    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        Mentor / Project Supervisor
      </p>

      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        DR. RAHUL THAKUR
      </h3>

      <p className="mt-1 text-sm font-semibold text-orange-300">
        Associate Professor
      </p>

      <p className="text-sm font-medium text-muted-foreground">
        Department of Computer Science and Engineering, IIT Roorkee
      </p>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        He established and leads the Internet of Things {"(IoT)"} Lab at IIT Roorkee
        and is also the co-founder of Pandabyte Innovations Private Limited.
      </p>
    </div>
  </div>
</div>
</section>


      </main>
    </PublicShell>
  )
}
