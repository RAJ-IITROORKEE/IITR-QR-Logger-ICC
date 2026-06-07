import Link from "next/link"

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-background/80 px-4 py-6 text-center text-xs text-muted-foreground">
      <p>
        QR-BIOMETRIC-CC | ICC, IIT Roorkee | Designed and Developed by{" "}
        <Link href="https://rajrabidas.me" target="_blank" rel="noreferrer" className="font-medium text-orange-300 hover:text-orange-200">
          Raj Rabidas
        </Link>
      </p>
    </footer>
  )
}
