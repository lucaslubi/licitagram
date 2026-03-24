'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/* ───────────────────────────────────────────────────────────
 * ScrollReveal — fade-in-up with IntersectionObserver
 * Wraps children and fades them in when they enter viewport.
 * ─────────────────────────────────────────────────────────── */
export function ScrollReveal({
  children,
  className = '',
  delay = 0,
  threshold = 0.15,
  once = true,
}: {
  children: ReactNode
  className?: string
  delay?: number
  threshold?: number
  once?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          if (once) observer.unobserve(el)
        } else if (!once) {
          setVisible(false)
        }
      },
      { threshold },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, once])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
 * CountUp — animated number counter using requestAnimationFrame
 * ─────────────────────────────────────────────────────────── */
export function CountUp({
  end,
  prefix = '',
  suffix = '',
  duration = 2000,
  className = '',
}: {
  end: number
  prefix?: string
  suffix?: string
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [started, setStarted] = useState(false)
  const [display, setDisplay] = useState('0')

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true)
          observer.unobserve(el)
        }
      },
      { threshold: 0.3 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [started])

  useEffect(() => {
    if (!started) return

    let startTime: number | null = null
    let rafId: number

    function animate(ts: number) {
      if (startTime === null) startTime = ts
      const elapsed = ts - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(eased * end)

      // Format with locale separators
      if (end >= 1000) {
        setDisplay(current.toLocaleString('pt-BR'))
      } else {
        setDisplay(String(current))
      }

      if (progress < 1) {
        rafId = requestAnimationFrame(animate)
      }
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [started, end, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}{display}{suffix}
    </span>
  )
}

/* ───────────────────────────────────────────────────────────
 * StickyLabel — small section label that sticks as you scroll
 * ─────────────────────────────────────────────────────────── */
export function StickyLabel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`sticky top-20 z-10 ${className}`}>
      {children}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
 * ClipRevealSection — section with clip-path reveal on scroll
 * ─────────────────────────────────────────────────────────── */
export function ClipRevealSection({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true)
        }
      },
      { threshold: 0.05 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        clipPath: revealed ? 'inset(0)' : 'inset(8px round 16px)',
        transition: 'clip-path 0.8s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {children}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
 * StickyHeader — header that adds shadow on scroll
 * ─────────────────────────────────────────────────────────── */
export function StickyHeader({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 bg-white/90 backdrop-blur-lg transition-shadow duration-300 ${
        scrolled ? 'shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : ''
      }`}
    >
      {children}
    </header>
  )
}
