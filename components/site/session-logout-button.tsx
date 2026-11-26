"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"

export function SessionLogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.replace("/")
    router.refresh()
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={handleLogout} className="min-h-9">
      Logout
      <LogOut className="size-3.5" aria-hidden="true" />
    </Button>
  )
}
