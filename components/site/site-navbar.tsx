import Link from "next/link"
import { ArrowUpRight, QrCode } from "lucide-react"

import { Button } from "@/components/ui/button"

export function SiteNavbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-2 rounded-xl px-1 py-1 transition hover:bg-muted/40">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-300">
            <QrCode className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight sm:text-base">QR-BIOMETRIC-CC</span>
            <span className="hidden text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:block">ICC IIT Roorkee</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/about" className="rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground sm:text-sm">
            About
          </Link>
          <Link href="/support" className="rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground sm:text-sm">
            Support
          </Link>
          <Button asChild size="sm" className="ml-1 h-9 bg-orange-500 text-black hover:bg-orange-400">
            <Link href="/admin" className="inline-flex items-center gap-1.5">
              Admin
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
