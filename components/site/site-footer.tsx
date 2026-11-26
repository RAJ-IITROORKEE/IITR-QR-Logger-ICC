import Link from "next/link"

import { FooterThemeToggle } from "@/components/theme/footer-theme-toggle"

export function SiteFooter() {
  return (
    <footer className="mobile-no-blur border-t border-border bg-background px-0 py-6 text-[0.82rem] text-muted-foreground">
      <div className="frame grid items-center gap-4 text-center sm:grid-cols-[1fr_auto_1fr]">
        <span className="hidden sm:block" />
        <p className="justify-self-center">
          QR LOGGER ICC | ICC, IIT Roorkee | Designed and Developed by{" "}
          <Link href="https://rajrabidas.me" target="_blank" rel="noreferrer" className="font-medium text-foreground transition-colors hover:text-brand">
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
