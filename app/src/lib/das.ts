// Cookie's DAS API resolves a mint address to human-readable token metadata
// instead of asking the user to trust a raw base58 string — design_doc.md
// §5.1. The exact endpoint shape here (`GET /api/tokens` returning the full
// registry, searched client-side) is confirmed against a real, working
// Cookie Chain submission's source, not official docs — `api.cookiescan.io`
// blocks the fetch tooling used to verify this independently (403s on
// non-browser requests), so this is the best-evidence version, worth a
// quick sanity check once it's testable in an actual browser.
import { PublicKey } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { COOK_DECIMALS, COOK_SYMBOL, DAS_API_URL, NATIVE_MINT, connection, shortAddr } from './chain'

export interface TokenInfo {
  mint: string
  symbol: string
  name: string
  decimals: number
  logoUri?: string
}

export const COOK_TOKEN: TokenInfo = {
  mint: NATIVE_MINT,
  symbol: COOK_SYMBOL,
  name: 'Cookie (native)',
  decimals: COOK_DECIMALS,
}

interface DasRegistryEntry {
  mint: string
  metadata?: { name?: string; symbol?: string; logo?: string; decimals?: number }
}

let registryPromise: Promise<Map<string, TokenInfo>> | null = null

/** The ~6k-token Cookiescan registry, fetched once and cached for the session. */
function loadRegistry(): Promise<Map<string, TokenInfo>> {
  registryPromise ??= (async () => {
    const res = await fetch(`${DAS_API_URL}/api/tokens`)
    if (!res.ok) throw new Error(`Cookiescan API returned ${res.status}`)
    const json = (await res.json()) as { data?: DasRegistryEntry[] }
    const byMint = new Map<string, TokenInfo>()
    for (const entry of json.data ?? []) {
      if (!entry.mint || typeof entry.metadata?.decimals !== 'number') continue
      byMint.set(entry.mint, {
        mint: entry.mint,
        symbol: entry.metadata.symbol || shortAddr(entry.mint),
        name: entry.metadata.name || 'Unknown token',
        decimals: entry.metadata.decimals,
        logoUri: entry.metadata.logo || undefined,
      })
    }
    return byMint
  })().catch((e: unknown) => {
    registryPromise = null
    throw e
  })
  return registryPromise
}

export interface ResolvedMint {
  info: TokenInfo
  tokenProgram: PublicKey
}

const mintCache = new Map<string, Promise<ResolvedMint>>()

/**
 * Resolves a mint address to token metadata + the token program that owns
 * it (Token or Token-2022). Registry data (name/symbol/logo) is used when
 * available; otherwise falls back to on-chain data for a valid mint the
 * registry doesn't know about, since `decimals` is required regardless (the
 * program needs it for every amount conversion) and shouldn't depend on the
 * registry being complete.
 *
 * Returns `null` only when `mintAddress` isn't a real token mint at all —
 * design_doc.md §5.1: that's the case the Create Vault form should reject
 * before the user ever gets to signing, not just an unregistered mint.
 */
export async function resolveMint(mintAddress: string): Promise<ResolvedMint | null> {
  if (mintAddress === NATIVE_MINT) return { info: COOK_TOKEN, tokenProgram: TOKEN_PROGRAM_ID }

  try {
    new PublicKey(mintAddress)
  } catch {
    return null
  }

  // The cache always holds the raw (possibly-rejecting) promise, so cache
  // cleanup-on-failure runs exactly once regardless of how many callers are
  // waiting on it; each caller derives its own null-on-failure result from
  // that shared promise below, rather than caching an already-converted
  // value that a second concurrent caller could read mid-cleanup-race.
  let promise = mintCache.get(mintAddress)
  if (!promise) {
    promise = resolveMintUncached(mintAddress)
    mintCache.set(mintAddress, promise)
    promise.catch(() => mintCache.delete(mintAddress))
  }
  return promise.catch(() => null)
}

async function resolveMintUncached(mintAddress: string): Promise<ResolvedMint> {
  const account = await connection.getParsedAccountInfo(new PublicKey(mintAddress))
  const value = account.value
  if (!value || !('parsed' in value.data) || value.data.parsed?.type !== 'mint') {
    throw new Error('Not a token mint on Cookie Chain')
  }
  const tokenProgram = value.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
  const decimals = Number(value.data.parsed.info.decimals)

  let info: TokenInfo = { mint: mintAddress, symbol: shortAddr(mintAddress), name: 'SPL token', decimals }
  try {
    const registry = await loadRegistry()
    const known = registry.get(mintAddress)
    if (known) info = known
  } catch {
    /* registry is a nice-to-have; decimals from on-chain data is what actually matters */
  }
  return { info, tokenProgram }
}
