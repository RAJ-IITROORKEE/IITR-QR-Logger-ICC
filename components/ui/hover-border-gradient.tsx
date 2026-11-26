"use client"

import { motion } from "motion/react"
import React, { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

type Direction = "TOP" | "LEFT" | "BOTTOM" | "RIGHT"

const DIRECTIONS: Direction[] = ["TOP", "LEFT", "BOTTOM", "RIGHT"]

const movingMap: Record<Direction, string> = {
  TOP: "radial-gradient(20.7% 50% at 50% 0%, hsl(0, 0%, 100%) 0%, rgba(255, 255, 255, 0) 100%)",
  LEFT: "radial-gradient(16.6% 43.1% at 0% 50%, hsl(0, 0%, 100%) 0%, rgba(255, 255, 255, 0) 100%)",
  BOTTOM: "radial-gradient(20.7% 50% at 50% 100%, hsl(0, 0%, 100%) 0%, rgba(255, 255, 255, 0) 100%)",
  RIGHT: "radial-gradient(16.2% 41.2% at 100% 50%, hsl(0, 0%, 100%) 0%, rgba(255, 255, 255, 0) 100%)",
}

// Brand orange instead of the original blue highlight.
const highlight = "radial-gradient(75% 181% at 50% 50%, #ff6a00 0%, rgba(255, 106, 0, 0) 100%)"

/**
 * Aceternity "Hover Border Gradient", re-skinned for the Raahi primary call to action:
 * solid #A44200 fill, #D05D11 border, a travelling light on the edge and a brand-orange bloom on hover.
 */
export function HoverBorderGradient({
  children,
  containerClassName,
  className,
  as: Tag = "button",
  duration = 1,
  clockwise = true,
  ...props
}: React.PropsWithChildren<
  {
    as?: React.ElementType
    containerClassName?: string
    className?: string
    duration?: number
    clockwise?: boolean
  } & React.HTMLAttributes<HTMLElement>
>) {
  const [hovered, setHovered] = useState(false)
  const [direction, setDirection] = useState<Direction>("TOP")

  useEffect(() => {
    if (hovered) return
    const interval = setInterval(() => {
      setDirection((current) => {
        const index = DIRECTIONS.indexOf(current)
        const next = clockwise ? (index - 1 + DIRECTIONS.length) % DIRECTIONS.length : (index + 1) % DIRECTIONS.length
        return DIRECTIONS[next]
      })
    }, duration * 1000)
    return () => clearInterval(interval)
  }, [hovered, clockwise, duration])

  return (
    <Tag
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex h-min w-fit flex-col flex-nowrap content-center items-center justify-center gap-10 overflow-visible rounded-md border border-primary-border bg-primary/30 p-px transition duration-500 hover:bg-primary/20",
        containerClassName,
      )}
      {...props}
    >
      <div className={cn("z-10 w-auto rounded-[inherit] bg-primary px-4 py-2 text-primary-foreground", className)}>
        {children}
      </div>
      <motion.div
        className="absolute inset-0 z-0 flex-none overflow-hidden rounded-[inherit]"
        style={{ filter: "blur(2px)", position: "absolute", width: "100%", height: "100%" }}
        initial={{ background: movingMap[direction] }}
        animate={{ background: hovered ? [movingMap[direction], highlight] : movingMap[direction] }}
        transition={{ ease: "linear", duration: duration ?? 1 }}
      />
      <div className="absolute inset-[2px] z-1 flex-none rounded-[5px] bg-primary" />
    </Tag>
  )
}
