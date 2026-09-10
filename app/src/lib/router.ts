import { useEffect, useState } from 'react'

export interface Route {
  path: string
  params: URLSearchParams
}

function parse(hash: string): Route {
  const h = hash.startsWith('#') ? hash.slice(1) : hash
  const [path, query = ''] = h.split('?')
  return { path: path || '/', params: new URLSearchParams(query) }
}

/**
 * Tiny hash router — deliberately not react-router-dom. The app deploys as
 * a static site (design_doc.md §6); a hash route needs no server-side
 * rewrite rules for a direct link or a refresh to keep working, and this
 * app is ~4 screens, not enough to justify the dependency.
 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(to: string) {
  location.hash = to
}
