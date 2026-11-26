"use client"

import Link from "next/link"
import { useState } from "react"
import { LockKeyhole } from "lucide-react"

import { SessionLogoutButton } from "@/components/site/session-logout-button"
import { Button } from "@/components/ui/button"
import {
  MobileNav,
  MobileNavHeader,
  MobileNavMenu,
  MobileNavToggle,
  NavBody,
  NavItems,
  Navbar,
  NavbarLogo,
} from "@/components/ui/resizable-navbar"

const publicItems = [
  { name: "How it works", link: "/#how" },
  { name: "Features", link: "/#features" },
  { name: "About", link: "/about" },
  { name: "Support", link: "/support" },
]

const signedInItems = [
  { name: "Dashboard", link: "/" },
  { name: "About", link: "/about" },
  { name: "Support", link: "/support" },
]

export function SiteNavbar({ authenticated = false }: { authenticated?: boolean }) {
  const [open, setOpen] = useState(false)
  const items = authenticated ? signedInItems : publicItems

  const actions = authenticated ? (
    <SessionLogoutButton />
  ) : (
    <>
      <Button asChild variant="outline" size="sm" className="min-h-9">
        <Link href="/#login">Staff login</Link>
      </Button>
      <Button asChild size="sm" className="min-h-9">
        <Link href="/admin/login">
          Admin
          <LockKeyhole className="size-3.5" aria-hidden="true" />
        </Link>
      </Button>
    </>
  )

  return (
    <Navbar>
      <NavBody>
        <NavbarLogo />
        <NavItems items={items} />
        <div className="relative z-20 flex items-center gap-2">{actions}</div>
      </NavBody>

      <MobileNav>
        <MobileNavHeader>
          <NavbarLogo />
          <MobileNavToggle isOpen={open} onClick={() => setOpen((current) => !current)} />
        </MobileNavHeader>
        <MobileNavMenu isOpen={open} onClose={() => setOpen(false)}>
          {items.map((item) => (
            <Link
              key={item.link}
              href={item.link}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {item.name}
            </Link>
          ))}
          <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-3">{actions}</div>
        </MobileNavMenu>
      </MobileNav>
    </Navbar>
  )
}
