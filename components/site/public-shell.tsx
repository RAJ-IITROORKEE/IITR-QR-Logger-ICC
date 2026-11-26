import { SiteFooter } from "./site-footer"
import { SiteNavbar } from "./site-navbar"

export function PublicShell({ children, authenticated = false }: Readonly<{ children: React.ReactNode; authenticated?: boolean }>) {
  return (
    <>
      <SiteNavbar authenticated={authenticated} />
      {/* Target of the "Skip to content" link rendered in the root layout */}
      <span id="content" tabIndex={-1} className="sr-only" />
      {children}
      <SiteFooter />
    </>
  )
}
