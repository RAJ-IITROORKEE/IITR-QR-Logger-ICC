import { Cpu, GraduationCap, ShieldCheck, Sparkles } from "lucide-react"

import { PublicShell } from "@/components/site/public-shell"

const features = [
  "Live QR biometric entry and exit logging for ICC deployment workflows.",
  "Dark orange mono-theme dashboard focused on fast operational visibility.",
  "Student-centric log views for scan state, device health, and timeline review.",
  "Admin-ready reporting with logs, analytics, exports, and support tracking.",
]

const iconTile = "flex size-[42px] shrink-0 items-center justify-center rounded-md border border-border bg-muted text-brand"

export default function AboutPage() {
  return (
    <PublicShell>
      <main className="flex-1 py-12">
        <div className="frame-section flex flex-col gap-6">
          <section className="animate-rise max-w-4xl">
            <p className="eyebrow inline-flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              ICC Implementation
            </p>
            <h1 className="type-h2 mt-4 text-foreground">About QR LOGGER ICC</h1>
            <p className="type-lede mt-4 max-w-3xl text-muted-foreground">
              QR LOGGER ICC is a dedicated QR biometric logger system implemented in ICC (Institute Computer Center), IIT Roorkee. It is designed to make student scan activity visible, organized, and exportable through a focused dashboard experience.
            </p>
          </section>

          <section className="reveal grid gap-4 md:grid-cols-2">
            <div className="panel p-6">
              <div className={`${iconTile} mb-4`}>
                <Cpu className="h-5 w-5" />
              </div>
              <h2 className="panel-title text-xl">Purpose</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                The project supports reliable student movement logging through QR biometric devices and gives ICC operators a clean, real-time interface for monitoring, review, support, and administrative reporting.
              </p>
            </div>
            <div className="panel p-6">
              <div className={`${iconTile} mb-4`}>
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="panel-title text-xl">Implementation</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                The system is implemented as a full-stack dashboard with live scan intake, structured log storage, support management, and admin analytics. The visual language is intentionally minimal, dark, and orange to match the QR biometric device interface.
              </p>
            </div>
          </section>

          <section className="reveal panel p-6">
            <h2 className="panel-title text-xl">Features</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {features.map((feature) => (
                <div key={feature} className="tile p-4 text-sm text-muted-foreground">
                  {feature}
                </div>
              ))}
            </div>
          </section>

          <section className="reveal grid gap-4 md:grid-cols-2">
            {/* Developer Card */}
            <div className="panel p-6">
              <div className="flex items-start gap-5">
                <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-muted font-mono text-xl font-semibold tracking-wide text-brand">
                  RR
                </div>

                <div className="min-w-0">
                  <p className="eyebrow">Designed & Developed by</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">RAJ RABIDAS</h2>
                  <p className="mt-1 text-sm font-medium text-brand">PowerGrid Centre of Excellence</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    B.Tech 3rd Year, Department of Metallurgical and Materials Engineering,
                    Indian Institute of Technology Roorkee.
                  </p>
                </div>
              </div>
            </div>

            {/* Mentor / Supervisor Card */}
            <div className="panel p-6">
              <div className="flex items-start gap-5">
                <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-brand">
                  <GraduationCap className="h-8 w-8" />
                </div>

                <div className="min-w-0">
                  <p className="text-[0.78rem] font-semibold text-muted-foreground">Mentor / Project Supervisor</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">DR. RAHUL THAKUR</h2>
                  <p className="mt-1 text-sm font-semibold text-brand">Associate Professor</p>
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
        </div>
      </main>
    </PublicShell>
  )
}
