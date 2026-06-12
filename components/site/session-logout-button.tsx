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
    <Button type="button" size="sm" variant="outline" onClick={handleLogout} className="h-9 border-orange-500/35 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 hover:text-orange-400">
      Logout
      <LogOut className="h-3.5 w-3.5" />
    </Button>
  )
}
