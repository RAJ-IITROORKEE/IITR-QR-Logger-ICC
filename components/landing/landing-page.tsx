import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  Clock3,
  Database,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  Lock,
  MonitorSmartphone,
  QrCode,
  Radio,
  ScanLine,
  ShieldCheck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { StaffLoginForm } from "@/components/landing/staff-login-form"
import { BackgroundBeams } from "@/components/ui/background-beams"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient"

type Item = { icon: LucideIcon; title: string; text: string }

const flow: Item[] = [
  { icon: QrCode, title: "Student QR", text: "The student shows the QR from the DOSW profile to the logger." },
  { icon: ScanLine, title: "QR logger", text: "The AtomS3R reads it, checks the URL, and keeps it in flash memory until the server confirms." },
  { icon: Database, title: "API and ledger", text: "The API saves the scan to MongoDB and works out IN or OUT, safely, even on retries." },
  { icon: Radio, title: "Realtime hint", text: "A tiny change hint wakes every open dashboard and the Tab5 display instantly." },
  { icon: LayoutDashboard, title: "Dashboard", text: "Staff see the live feed. Polling stays on as a safety net." },
]

const features: Item[] = [
  { icon: Zap, title: "Realtime", text: "Live QR scan feed that updates the moment a student scans." },
  { icon: Lock, title: "Secure", text: "Staff-only logger behind role-based credentials." },
  { icon: Users, title: "Student history", text: "Full IN/OUT records for every student." },
  { icon: KeyRound, title: "Admin control", text: "Create and update staff, professor and admin access." },
  { icon: Fingerprint, title: "Roles", text: "Staff, professor, or super admin, each with the right access." },
  { icon: MonitorSmartphone, title: "Tab5 display", text: "A wall display shows the latest student card live." },
]

const reliability: Item[] = [
  { icon: Database, title: "No scan is lost", text: "Each scan is saved on the device first and only removed after the server confirms the exact record, so power cuts and Wi-Fi drops do not lose attendance." },
  { icon: Radio, title: "Realtime with a safety net", text: "A WebSocket hint makes updates instant, and every client also polls the server, so a missed message can never leave a screen stale." },
  { icon: ShieldCheck, title: "Protected by design", text: "Device keys are stored hashed, devices are locked to their hardware address, and dashboards sit behind staff, professor and super admin credentials." },
]

function SectionHeading({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="type-h2 mt-3">{title}</h2>
      {lede ? <p className="type-lede mx-auto mt-4 max-w-2xl">{lede}</p> : null}
    </div>
  )
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-[42px] shrink-0 items-center justify-center rounded-md border border-border bg-muted text-brand">
      <Icon className="size-5" aria-hidden="true" />
    </span>
  )
}

function LoggerPreview() {
  return (
    <div className="panel shadow-[var(--shadow-preview)]" aria-label="Illustrative logger preview">
      <div className="panel-head">
        <div className="flex items-center gap-2.5">
          <ScanLine className="size-[18px] text-brand" aria-hidden="true" />
          <span className="panel-title">Live logger</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral">Preview</Badge>
          <Badge variant="active">
            <span className="pulse-ring inline-block size-[7px] rounded-full bg-current text-active" />
            Live
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:p-5">
        <div className="tile flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-border bg-card text-lg font-semibold text-muted-foreground" aria-hidden="true">
            SN
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold">Student Name</p>
              <Badge variant="active">
                <span className="size-[7px] rounded-full bg-current" />
                IN
              </Badge>
            </div>
            <p className="mt-1 text-[0.86rem] text-muted-foreground">
              Enrollment <span className="font-mono text-foreground">2XXXXXXX</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="tile">
            <p className="text-[0.78rem] text-muted-foreground">Today&apos;s logs</p>
            <p className="telemetry-value mt-1">128</p>
          </div>
          <div className="tile">
            <p className="text-[0.78rem] text-muted-foreground">Inside</p>
            <p className="telemetry-value mt-1">
              64 <span className="telemetry-unit">now</span>
            </p>
          </div>
          <div className="tile">
            <p className="text-[0.78rem] text-muted-foreground">Last scan</p>
            <p className="telemetry-value mt-1">
              2<span className="telemetry-unit"> s ago</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-[0.82rem] text-muted-foreground">
        <span>
          Device <span className="font-mono text-foreground">QRB-201</span> · Sample data
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono">
          <Clock3 className="size-3.5" aria-hidden="true" />
          Sign in for live data
        </span>
      </div>
    </div>
  )
}

export function LandingPage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="hero-atmosphere relative overflow-hidden">
        <BackgroundBeams className="opacity-[0.12]" />
        <div className="frame-wide relative z-10 grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[0.96fr_1.04fr] lg:py-24">
          <div className="max-w-[40rem]">
            <p className="eyebrow animate-rise">ICC Secure QR Logger · IIT Roorkee</p>
            <h1 className="type-h1-home animate-rise delay-65 mt-4">
              Log every campus movement.
              <span className="block text-brand">See who is in, instantly.</span>
            </h1>
            <p className="type-lede animate-rise delay-125 mt-5 max-w-[35rem]">
              Monitor live QR scans, verify IN/OUT movement, and keep ICC student access records protected behind staff, professor, and super admin credentials.
            </p>
            <div className="animate-rise delay-185 mt-7 flex flex-wrap gap-2.5">
              <a href="#login" className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <HoverBorderGradient as="span" className="flex min-h-[42px] items-center gap-2 px-4 text-sm font-[550]">
                  Staff login
                  <ArrowRight className="size-4" aria-hidden="true" />
                </HoverBorderGradient>
              </a>
              <Button asChild variant="outline" className="min-h-11 px-4 font-[550]">
                <Link href="#how">How it works</Link>
              </Button>
            </div>
            <dl className="animate-rise delay-230 mt-9 grid max-w-[34rem] grid-cols-3 gap-3 text-sm">
              {[
                ["Realtime", "Live scan feed"],
                ["Durable", "Scans survive outages"],
                ["Secure", "Role-based access"],
              ].map(([title, text]) => (
                <div key={title} className="border-l border-border pl-3">
                  <dt className="font-semibold">{title}</dt>
                  <dd className="mt-0.5 text-[0.82rem] text-muted-foreground">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="animate-rise delay-230">
            <LoggerPreview />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="reveal frame scroll-mt-24 py-16 sm:py-24">
        <SectionHeading eyebrow="How it works" title="From a QR scan to a live dashboard" lede="Five steps, each one built to keep working when the network does not." />
        <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[1101px]:grid-cols-5">
          {flow.map((step, index) => (
            <li key={step.title} className="panel flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <IconTile icon={step.icon} />
                <span className="font-mono text-[0.78rem] text-muted-foreground" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="panel-title">{step.title}</h3>
              <p className="text-[0.86rem] leading-6 text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section id="features" className="reveal frame scroll-mt-24 pb-16 sm:pb-24">
        <SectionHeading eyebrow="Features" title="Everything ICC staff need" />
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="panel flex gap-4 p-4">
              <IconTile icon={feature.icon} />
              <div>
                <h3 className="panel-title">{feature.title}</h3>
                <p className="mt-1 text-[0.86rem] leading-6 text-muted-foreground">{feature.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Reliability */}
      <section className="reveal frame-section pb-16 sm:pb-24">
        <SectionHeading eyebrow="Built to be trusted" title="Reliable when it matters" />
        <div className="mt-12 grid gap-3 md:grid-cols-3">
          {reliability.map((item) => (
            <div key={item.title} className="panel p-5">
              <IconTile icon={item.icon} />
              <h3 className="panel-title mt-4">{item.title}</h3>
              <p className="mt-2 text-[0.86rem] leading-6 text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Staff login */}
      <section id="login" className="reveal frame-section scroll-mt-24 pb-16 sm:pb-24">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <p className="eyebrow">Staff access</p>
            <h2 className="type-h2 mt-3">Open the live dashboard</h2>
            <p className="type-lede mt-4 max-w-md">
              Sign in with the access account an administrator created for you. Everything on the dashboard is protected behind these credentials.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link href="/about">View the system</Link>
            </Button>
          </div>
          <StaffLoginForm />
        </div>
      </section>

      {/* Institute */}
      <section className="reveal frame-section pb-16 sm:pb-24">
        <div className="panel flex flex-col items-start gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted p-2">
            <Image src="/logo.png" alt="QR LOGGER ICC logo" width={64} height={64} className="size-14 object-contain" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="panel-title text-lg">Built at the Institute Computer Centre, IIT Roorkee</h2>
            <p className="mt-1 text-[0.86rem] leading-6 text-muted-foreground">
              QR LOGGER ICC is a dedicated QR logging system for student movement at ICC, developed with the PowerGrid Centre of Excellence.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/about">About</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/support">Support</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}
