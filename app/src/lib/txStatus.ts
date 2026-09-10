import { AnchorError } from '@coral-xyz/anchor'

export type TxPhase =
  | { kind: 'idle' }
  | { kind: 'building' }
  | { kind: 'awaiting-signature' }
  | { kind: 'submitted'; signature: string }
  | { kind: 'confirmed'; signature: string }
  | { kind: 'failed'; message: string }

/**
 * Turns a thrown error from a program call into the message to show. For an
 * on-chain program error this is literally the `#[msg("...")]` text already
 * written for each `CookieVaultError` variant (error.rs) — one place these
 * strings are authored, not duplicated here and left to drift.
 */
export function txErrorMessage(e: unknown): string {
  if (e instanceof AnchorError) return e.error.errorMessage
  const msg = e instanceof Error ? e.message : String(e)
  if (/reject|denied|cancel|declin/i.test(msg)) return 'You rejected the request in your wallet.'
  if (/insufficient/i.test(msg)) return "You don't have enough COOK to cover this transaction and its fees."
  if (/blockhash not found|expired/i.test(msg)) {
    return 'This transaction took too long and expired before confirming — please try again.'
  }
  return msg
}
