import { useEffect, useState } from 'react'

/**
 * The current time as React state, refreshed periodically, instead of
 * reading `Date.now()` directly during render (impure — can give
 * inconsistent values across renders within one commit). Refreshing it
 * also means a "not unlocked yet" vault flips to claimable on its own,
 * without the viewer needing to reload the page.
 */
export function useNow(refreshMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), refreshMs)
    return () => clearInterval(id)
  }, [refreshMs])
  return now
}
