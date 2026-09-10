import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * The short edge decides, not the width.
 *
 * This was `window.innerWidth < 768`, which calls a phone in landscape a
 * desktop: a 390x844 handset is 844px wide the moment it is rotated. That one
 * comparison did three things at once, all of them wrong on a rotated phone —
 * `Game.tsx` gates the joystick, d-pad and quick actions on it, so the touch
 * controls disappeared entirely; it gates the desktop event-log panel on its
 * negation, so that appeared instead; and `mobile.css` is scoped to the same
 * 767px, so the safe-area insets switched off in the one orientation where the
 * notch is on a *side*.
 *
 * A phone is still a phone when you turn it, so measure the short edge. Width
 * alone continues to promote a narrow desktop window, which is existing
 * behaviour and worth keeping. The coarse-pointer test is what stops that short
 * edge from dragging in a large touch screen: a tablet in landscape is 820px on
 * its short edge and stays on the desktop layout.
 *
 * Kept in step with the media query at the top of `mobile.css`, which carries
 * the same condition in CSS form.
 */
function computeIsMobile(): boolean {
  if (typeof window === "undefined") return false

  const width = window.innerWidth
  const height = window.innerHeight
  if (width < MOBILE_BREAKPOINT) return true

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches
  return coarsePointer && Math.min(width, height) < MOBILE_BREAKPOINT
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const onChange = () => setIsMobile(computeIsMobile())

    // A `matchMedia("(max-width: 767px)")` listener cannot see the case this
    // exists for: rotating a phone moves the width from 390 to 844, and that
    // query is false on both sides of the change, so it never fires. Listen to
    // the resize itself.
    window.addEventListener("resize", onChange)
    window.addEventListener("orientationchange", onChange)
    const pointerQuery = window.matchMedia("(pointer: coarse)")
    pointerQuery.addEventListener("change", onChange)

    onChange()
    return () => {
      window.removeEventListener("resize", onChange)
      window.removeEventListener("orientationchange", onChange)
      pointerQuery.removeEventListener("change", onChange)
    }
  }, [])

  return !!isMobile
}

/**
 * A phone held sideways — mobile, but wider than it is tall.
 *
 * The HUD is built for a tall, narrow screen: the sector timer is a vertical
 * bar down one edge and the event-log drawer comes up from the bottom. Both are
 * wrong when the short edge is the vertical one, so the layout needs to know
 * which way round it is, not merely that it is a phone.
 */
export function useIsLandscapePhone() {
  const isMobile = useIsMobile()
  const [isLandscape, setIsLandscape] = React.useState(false)

  React.useEffect(() => {
    const onChange = () => {
      if (typeof window === "undefined") return
      setIsLandscape(window.innerWidth > window.innerHeight)
    }

    window.addEventListener("resize", onChange)
    window.addEventListener("orientationchange", onChange)
    onChange()
    return () => {
      window.removeEventListener("resize", onChange)
      window.removeEventListener("orientationchange", onChange)
    }
  }, [])

  return isMobile && isLandscape
}
