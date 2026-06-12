import { SiteFooter } from "./site-footer"
import { SiteNavbar } from "./site-navbar"

export function PublicShell({ children, authenticated = false }: Readonly<{ children: React.ReactNode; authenticated?: boolean }>) {
  return (
    <>
      <SiteNavbar authenticated={authenticated} />
      {children}
      <SiteFooter />
    </>
  )
}
