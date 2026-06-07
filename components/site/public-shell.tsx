import { SiteFooter } from "./site-footer"
import { SiteNavbar } from "./site-navbar"

export function PublicShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteNavbar />
      {children}
      <SiteFooter />
    </>
  )
}
