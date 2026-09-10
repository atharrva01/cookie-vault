import { Connection, PublicKey } from '@solana/web3.js'

export const RPC_URL = 'https://rpc.cookiescan.io'
export const EXPLORER_URL = 'https://cookiescan.io'
export const DAS_API_URL = 'https://api.cookiescan.io'
export const BRIDGE_URL = 'https://hyperlane.cookiescan.io'

/** Identifies Cookie Chain to wallets that support network switching (e.g. Nightly). */
export const COOKIE_GENESIS_HASH = '9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2'

export const COOK_DECIMALS = 9
export const COOK_SYMBOL = 'COOK'
/** Native COOK uses the same wrapped-native mint id as wrapped SOL does on Solana. */
export const NATIVE_MINT = 'So11111111111111111111111111111111111111112'

export const connection = new Connection(RPC_URL, { commitment: 'confirmed' })

export const addressUrl = (address: string) => `${EXPLORER_URL}/address/${address}`
export const txUrl = (signature: string) => `${EXPLORER_URL}/tx/${signature}`

export function shortAddr(address: string, n = 4): string {
  return address.length <= 2 * n + 1 ? address : `${address.slice(0, n)}…${address.slice(-n)}`
}

export function isPubkey(value: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false
  try {
    new PublicKey(value)
    return true
  } catch {
    return false
  }
}

/** "1.5" at 6 decimals -> 1500000n. Throws on malformed or non-positive input. */
export function parseUnits(amount: string, decimals: number): bigint {
  const s = amount.trim().replace(',', '.')
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') throw new Error('Invalid amount')
  const [whole, frac = ''] = s.split('.')
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimal places`)
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  const raw = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0')
  if (raw <= 0n) throw new Error('Amount must be greater than zero')
  return raw
}

/** 1500000n at 6 decimals -> "1.5" (trailing zeros trimmed). */
export function formatUnits(raw: bigint | number | string, decimals: number, maxFrac = decimals): string {
  const v = BigInt(raw)
  const neg = v < 0n
  const abs = neg ? -v : v
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = (abs % base)
    .toString()
    .padStart(decimals, '0')
    .slice(0, maxFrac)
    .replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? '.' + frac : ''}`
}
