"use client"

import Link from "next/link"
import { BarChart3, Headphones, Home, Logs, QrCode } from "lucide-react"

import { AdminSidebarLink } from "@/components/admin/admin-sidebar-link"

const links = [
  { href: "/admin", label: "Dashboard", icon: Home },
  { href: "/admin/logs", label: "Logs", icon: Logs },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/support", label: "Support", icon: Headphones },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-orange-500/15 bg-[#100b08]/95 p-4 backdrop-blur lg:block">
        <Link href="/" className="flex items-center gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-black">
            <QrCode className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-wide">QR-BIOMETRIC-CC</span>
            <span className="text-xs text-orange-100/65">Admin Control Room</span>
          </span>
        </Link>

        <nav className="mt-6 space-y-1">
          {links.map((link) => (
            <AdminSidebarLink key={link.href} {...link} />
          ))}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-orange-300">ICC IIT Roorkee</p>
              <h1 className="text-lg font-semibold">QR Biometric Admin</h1>
            </div>
            <Link href="/" className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-orange-500/50 hover:text-orange-200">
              Public dashboard
            </Link>
          </div>
          <nav className="flex gap-2 overflow-x-auto border-t border-border px-4 py-2 lg:hidden">
            {links.map((link) => (
              <AdminSidebarLink key={link.href} compact {...link} />
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
