import Link from "next/link"

import { FooterThemeToggle } from "@/components/theme/footer-theme-toggle"

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-background/80 px-4 py-6 text-xs text-muted-foreground backdrop-blur">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-4 text-center sm:grid-cols-[1fr_auto_1fr]">
        <span className="hidden sm:block" />
        <p className="justify-self-center">
          QR LOGGER ICC | ICC, IIT Roorkee | Designed and Developed by{" "}
          <Link href="https://rajrabidas.me" target="_blank" rel="noreferrer" className="font-medium text-orange-500 transition-colors hover:text-orange-400 dark:text-orange-300 dark:hover:text-orange-200">
            Raj Rabidas
          </Link>{" "}
          | PowerGrid Centre of Excellence
        </p>
        <div className="justify-self-center sm:justify-self-end">
          <FooterThemeToggle />
        </div>
      </div>
    </footer>
  )
}
