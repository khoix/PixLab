import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * The one definition of "present the phone layout", shared with CSS.
 *
 * `mobile.css` opens with this exact query. Keeping the string identical is the
 * point: an earlier cut of this hook expressed the same intent in JS as "the
 * short edge is under 768px", which sounds equivalent and is not. On the
 * chromium-mobile Playwright project a test sets a 1280x720 viewport; that
 * reports a coarse pointer, so the short-edge rule made it a phone and hid the
 * desktop consumables panel, while the CSS — which asks for a viewport 500px
 * tall or less — correctly called it a desktop. Two rules that were supposed to
 * agree, quietly disagreeing.
 *
 * What it matches:
 *   - anything under 768px wide: a portrait phone, or a narrow desktop window,
 *     which is long-standing behaviour and stays;
 *   - a coarse pointer on a short, wide viewport: a phone that has been
 *     rotated. This is the case the old `innerWidth < 768` test missed, since a
 *     390x844 handset is 844px wide in landscape.
 *
 * A tablet in landscape is taller than 500px and a desktop has a fine pointer,
 * so neither is pulled in.
 */
export const MOBILE_MEDIA_QUERY =
  `(max-width: ${MOBILE_BREAKPOINT - 1}px), (pointer: coarse) and (orientation: landscape) and (max-height: 500px)`

function computeIsMobile(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const onChange = () => setIsMobile(computeIsMobile())

    // The query covers both clauses, so it fires on a rotation that crosses
    // either one. The resize listener is still here because Playwright's
    // `setViewportSize` and some mobile browsers resize without the media
    // query re-evaluating in time to be observed.
    const query = window.matchMedia(MOBILE_MEDIA_QUERY)
    query.addEventListener("change", onChange)
    window.addEventListener("resize", onChange)
    window.addEventListener("orientationchange", onChange)

    onChange()
    return () => {
      query.removeEventListener("change", onChange)
      window.removeEventListener("resize", onChange)
      window.removeEventListener("orientationchange", onChange)
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
