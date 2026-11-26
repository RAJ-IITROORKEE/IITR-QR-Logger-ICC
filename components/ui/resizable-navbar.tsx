"use client"

import Image from "next/image"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react"
import React, { useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Aceternity "Resizable Navbar", re-skinned with the Raahi tokens.
 * The desktop bar compacts from a 1220px to a 960px cap once the page scrolls past 32px.
 */

interface NavbarProps {
  children: React.ReactNode
  className?: string
}

interface NavBodyProps {
  children: React.ReactNode
  className?: string
  visible?: boolean
}

interface NavItemsProps {
  items: { name: string; link: string }[]
  className?: string
  onItemClick?: () => void
}

interface MobileNavProps {
  children: React.ReactNode
  className?: string
  visible?: boolean
}

export const Navbar = ({ children, className }: NavbarProps) => {
  const { scrollY } = useScroll()
  const [visible, setVisible] = useState(false)

  useMotionValueEvent(scrollY, "change", (latest) => setVisible(latest > 32))

  return (
    <div className={cn("sticky inset-x-0 top-0 z-50 w-full pt-2", className)}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ visible?: boolean }>, { visible })
          : child,
      )}
    </div>
  )
}

export const NavBody = ({ children, className, visible }: NavBodyProps) => {
  return (
    <motion.div
      initial={false}
      animate={{ maxWidth: visible ? 960 : 1220, y: visible ? 4 : 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative z-[60] mx-auto hidden w-[calc(100%-2rem)] flex-row items-center justify-between self-start rounded-lg border border-transparent px-3 py-2 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-200 lg:flex",
        visible && "border-border bg-card/90 shadow-[var(--shadow-header)] backdrop-blur-md",
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

export const NavItems = ({ items, className, onItemClick }: NavItemsProps) => {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <div
      onMouseLeave={() => setHovered(null)}
      className={cn(
        "pointer-events-none absolute inset-0 hidden flex-row items-center justify-center gap-1 text-sm font-medium lg:flex",
        className,
      )}
    >
      {items.map((item, index) => (
        <Link
          key={item.link}
          href={item.link}
          onMouseEnter={() => setHovered(index)}
          onClick={onItemClick}
          className="pointer-events-auto relative rounded-md px-3.5 py-2 text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:text-foreground"
        >
          {hovered === index && (
            <motion.span layoutId="nav-hover" className="absolute inset-0 rounded-md bg-secondary" />
          )}
          <span className="relative z-10">{item.name}</span>
        </Link>
      ))}
    </div>
  )
}

export const MobileNav = ({ children, className, visible }: MobileNavProps) => {
  return (
    <motion.div
      initial={false}
      animate={{ y: visible ? 4 : 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative z-50 mx-auto flex w-[calc(100%-1.5rem)] flex-col items-center justify-between rounded-lg border border-transparent px-2 py-2 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-200 lg:hidden",
        visible && "border-border bg-card/90 shadow-[var(--shadow-header)] backdrop-blur-md",
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

export const MobileNavHeader = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return <div className={cn("flex w-full flex-row items-center justify-between", className)}>{children}</div>
}

export const MobileNavMenu = ({
  children,
  className,
  isOpen,
}: {
  children: React.ReactNode
  className?: string
  isOpen: boolean
  onClose: () => void
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "absolute inset-x-0 top-14 z-50 flex w-full flex-col items-stretch justify-start gap-1 rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-header)]",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export const MobileNavToggle = ({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-label={isOpen ? "Close menu" : "Open menu"}
      className="inline-flex size-10 items-center justify-center rounded-md border border-border bg-secondary text-foreground transition-colors hover:bg-accent"
    >
      {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
    </button>
  )
}

export const NavbarLogo = () => {
  return (
    <Link href="/" className="relative z-20 flex items-center gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-secondary/60">
      <Image src="/logo.png" alt="QR LOGGER ICC logo" width={36} height={36} className="size-9 object-contain" priority />
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight sm:text-base">QR LOGGER ICC</span>
        <span className="eyebrow hidden text-[0.62rem] sm:block">ICC IIT Roorkee</span>
      </span>
    </Link>
  )
}
