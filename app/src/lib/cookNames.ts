// `.cook` name resolution (CookOven name service) for the recipient field —
// design_doc.md §9's should-have, matching PayJar's real integration. The
// program ID, account discriminators, and byte layout below are copied from
// a real, working Cookie Chain submission's actual source (not guessed, and
// not independently verifiable against official docs — see das.ts's header
// comment for why `api.cookiescan.io`-adjacent things keep needing this
// caveat: the fetch tooling available here gets blocked by 403s on anything
// that looks like a bot request).
//
// Byte layout: `DomainAccount` = 8-byte discriminator, borsh-encoded string
// `name` (4-byte LE length prefix + bytes), then `owner: Pubkey` (32 bytes),
// then `resolver: Pubkey` (32 bytes, equal to the System Program ID when
// unset).
import { Buffer } from 'buffer'
import { PublicKey } from '@solana/web3.js'
import { connection, isPubkey } from './chain'

export const COOKOVEN_PROGRAM_ID = new PublicKey('H43Qtq4AMQ86y7yc3YtCKZJ2QMhhnCcHyZKeFeoQn7PA')
export const COOK_TLD = '.cook'
const DOMAIN_DISCRIMINATOR = Buffer.from([35, 146, 98, 112, 13, 230, 231, 153])
const UNSET_RESOLVER = PublicKey.default.toBase58() // System Program ID (all-zero), CookOven's "not set" sentinel

export function normalizeName(input: string): string {
  const s = input.trim().toLowerCase()
  return s.endsWith(COOK_TLD) ? s.slice(0, -COOK_TLD.length) : s
}

function nameError(label: string): string | null {
  if (!label) return 'name is empty'
  if (Buffer.byteLength(label) > 32) return 'name is longer than 32 characters'
  if (!/^[a-z0-9-]+$/.test(label)) return 'only a-z, 0-9 and hyphens are allowed'
  if (label.startsWith('-') || label.endsWith('-')) return 'no leading or trailing hyphen'
  return null
}

/** True if `input` reads as a `.cook` name rather than a raw address — doesn't confirm it's registered. */
export function looksLikeCookName(input: string): boolean {
  const s = input.trim()
  if (!s) return false
  if (s.toLowerCase().endsWith(COOK_TLD)) return true
  return !isPubkey(s)
}

export interface ResolvedName {
  label: string
  owner: string
  resolver: string | null
}

/** Reads a `DomainAccount` PDA directly (no IDL for a program we don't own) and decodes it by hand. */
export async function resolveCookName(input: string): Promise<ResolvedName | null> {
  const label = normalizeName(input)
  const err = nameError(label)
  if (err) throw new Error(`"${input}" is not a valid ${COOK_TLD} name: ${err}`)

  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('domain'), Buffer.from(label)], COOKOVEN_PROGRAM_ID)
  const info = await connection.getAccountInfo(pda)
  if (!info) return null

  const data = info.data
  if (data.length < 12 || !DOMAIN_DISCRIMINATOR.equals(Buffer.from(data.subarray(0, 8)))) return null
  const nameLen = data.readUInt32LE(8)
  const afterName = 12 + nameLen
  if (afterName + 32 > data.length) return null

  const owner = new PublicKey(data.subarray(afterName, afterName + 32)).toBase58()
  let resolver: string | null = null
  if (afterName + 64 <= data.length) {
    const r = new PublicKey(data.subarray(afterName + 32, afterName + 64)).toBase58()
    resolver = r === UNSET_RESOLVER ? null : r
  }
  return { label, owner, resolver }
}

export interface ResolvedRecipient {
  address: PublicKey
  name: string | null
}

/** Accepts either a base58 address or a `.cook` name and returns the pubkey to use as `recipient`. */
export async function resolveRecipientInput(input: string): Promise<ResolvedRecipient> {
  const s = input.trim()
  if (isPubkey(s)) return { address: new PublicKey(s), name: null }
  if (!looksLikeCookName(s)) throw new Error('Enter a wallet address or a .cook name')
  const resolved = await resolveCookName(s)
  if (!resolved) throw new Error(`${normalizeName(s)}${COOK_TLD} is not registered`)
  return { address: new PublicKey(resolved.resolver ?? resolved.owner), name: resolved.label + COOK_TLD }
}
