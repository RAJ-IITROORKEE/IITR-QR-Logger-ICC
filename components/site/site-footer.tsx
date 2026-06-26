import Link from "next/link"

import { FooterThemeToggle } from "@/components/theme/footer-theme-toggle"

export function SiteFooter() {
  return (
    <footer className="mobile-no-blur border-t border-border/70 bg-background/90 px-4 py-6 text-xs text-muted-foreground md:bg-background/80 md:backdrop-blur">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-4 text-center sm:grid-cols-[1fr_auto_1fr]">
        <span className="hidden sm:block" />
        <p className="justify-self-center">
          QR LOGGER ICC | ICC, IIT Roorkee | Designed and Developed by{" "}
          <Link href="https://rajrabidas.me" target="_blank" rel="noreferrer" className="font-medium transition-colors hover:text-primary">
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
