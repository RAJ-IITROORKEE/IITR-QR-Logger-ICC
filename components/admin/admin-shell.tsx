"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  KeyRound,
  Headphones,
  Home,
  LayoutDashboard,
  LogOut,
  Logs,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { FooterThemeToggle } from "@/components/theme/footer-theme-toggle"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

type NavItem = {
  href: string
  label: string
  description: string
  icon: LucideIcon
}

const primaryLinks: NavItem[] = [
  { href: "/admin", label: "Dashboard", description: "Daily and monthly scan overview", icon: LayoutDashboard },
  { href: "/admin/logs", label: "Logs", description: "Search, sort, delete, and clear records", icon: Logs },
  { href: "/admin/analytics", label: "Analytics", description: "Device summaries and entry timelines", icon: BarChart3 },
  { href: "/admin/access", label: "Access", description: "Create and update staff credentials", icon: KeyRound },
  { href: "/admin/support", label: "Support", description: "User issues and enquiries", icon: Headphones },
  { href: "/admin/settings", label: "Settings", description: "Devices and API endpoint details", icon: Settings },
]

const secondaryLinks: NavItem[] = [
  { href: "/", label: "Public Dashboard", description: "Open live QR logger", icon: Home },
  { href: "/support", label: "Public Support", description: "Open user support page", icon: ShieldCheck },
]

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return href === "/admin" ? pathname === href : pathname.startsWith(href)
}

function pageTitle(pathname: string) {
  return primaryLinks.find((item) => isActivePath(pathname, item.href))?.label ?? "Dashboard"
}

function SidebarLink({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const Icon = item.icon

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActivePath(pathname, item.href)} tooltip={item.label}>
        <Link href={item.href}>
          <Icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function AdminUserMenu() {
  const router = useRouter()
  const { isMobile } = useSidebar()

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.replace("/admin/login")
    router.refresh()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-orange-500 text-xs font-bold text-black">AD</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Admin</span>
                <span className="truncate text-xs text-muted-foreground">QR LOGGER ICC</span>
              </div>
              <LogOut className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-orange-500 text-xs font-bold text-black">AD</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Admin</span>
                  <span className="truncate text-xs text-muted-foreground">Authenticated session</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function AdminAppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Link href="/admin">
                <span className="flex aspect-square size-9 items-center justify-center">
                  <Image src="/logo.png" alt="QR LOGGER ICC logo" width={36} height={36} className="size-9 object-contain" />
                </span>
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">QR LOGGER ICC</span>
                  <span className="truncate text-xs text-muted-foreground">Admin Control Room</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>QR Biometric</SidebarGroupLabel>
          <SidebarMenu>
            {primaryLinks.map((item) => (
              <SidebarLink key={item.href} item={item} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Access</SidebarGroupLabel>
          <SidebarMenu>
            {secondaryLinks.map((item) => (
              <SidebarLink key={item.href} item={item} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <AdminUserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const title = pageTitle(pathname)

  return (
    <SidebarProvider>
      <AdminAppSidebar />
      <SidebarInset className="bg-background/70 backdrop-blur-sm">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/85 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-14">
          <div className="flex flex-1 items-center gap-2 px-4 lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/admin">Admin Panel</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/support">
                  <Headphones className="size-4" />
                  Support
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/">Public dashboard</Link>
              </Button>
            </div>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 pt-4 lg:p-6">
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4">{children}</div>
        </main>
        <footer className="border-t bg-background/70 px-4 py-3 text-xs text-muted-foreground backdrop-blur">
          <div className="mx-auto grid w-full max-w-7xl items-center gap-3 text-center sm:grid-cols-[1fr_auto_1fr]">
            <span className="hidden sm:block" />
            <p className="justify-self-center">
              All Rights Reserved | Developed by{" "}
              <Link href="https://rajrabidas.me" target="_blank" rel="noreferrer" className="transition-colors hover:text-primary">
                Raj Rabidas
              </Link>{" "}
              | PowerGrid Centre of Excellence | IIT Roorkee
            </p>
            <div className="justify-self-center sm:justify-self-end">
              <FooterThemeToggle />
            </div>
          </div>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  )
}
