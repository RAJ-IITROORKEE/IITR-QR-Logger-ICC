"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function FooterThemeToggle() {
  const { theme, setTheme } = useTheme()
  const activeTheme = theme === "light" ? "light" : "dark"

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-2 py-1 text-xs text-muted-foreground">
      {activeTheme === "light" ? <Sun className="size-3.5 text-brand" /> : <Moon className="size-3.5 text-brand" />}
      <span className="hidden sm:inline">Theme</span>
      <Select value={activeTheme} onValueChange={setTheme}>
        <SelectTrigger size="sm" className="h-7 border-0 bg-transparent px-1.5 text-xs shadow-none focus-visible:ring-0">
          <SelectValue aria-label="Theme" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="dark">Dark</SelectItem>
          <SelectItem value="light">Light</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
