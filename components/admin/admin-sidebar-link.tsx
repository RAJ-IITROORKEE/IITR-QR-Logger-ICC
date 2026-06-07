"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function AdminSidebarLink({
  href,
  label,
  icon: Icon,
  compact = false,
}: {
  href: string
  label: string
  icon: LucideIcon
  compact?: boolean
}) {
  const pathname = usePathname()
  const active = href === "/admin" ? pathname === href : pathname.startsWith(href)

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
        active
          ? "border-orange-500/45 bg-orange-500/15 text-orange-100"
          : "border-transparent text-muted-foreground hover:border-orange-500/20 hover:bg-orange-500/10 hover:text-orange-100",
        compact && "shrink-0 py-2 text-xs"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}
