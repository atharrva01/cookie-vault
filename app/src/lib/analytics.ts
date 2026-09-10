// Program-wide vault stats — design_doc.md §9's "should-have" analytics
// panel: total vaults, status breakdown, and total value locked. TVL is
// summed per-mint, not combined into one raw number, since adding together
// amounts of different tokens without a price would be meaningless; a
// combined USD figure (analytics.tsx) only covers the mints Cookiescan has
// a price for and says so.
import type { AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { getProgram } from './idl'
import type { VaultAccount } from './program'

export interface MintTotal {
  mint: PublicKey
  locked: bigint
}

export interface VaultStats {
  totalVaults: number
  active: number
  fullyReleased: number
  cancelled: number
  lockedByMint: MintTotal[]
}

function isFullyReleased(v: VaultAccount): boolean {
  return 'timeLock' in v.conditionType ? v.releasedAmount.gtn(0) : v.milestones.every((m) => m.claimed)
}

/** Fetches every vault the program has ever created (no depositor/recipient filter) and aggregates it. */
export async function fetchVaultStats(provider: AnchorProvider): Promise<VaultStats> {
  const program = getProgram(provider)
  const all = await program.account.vault.all()

  let active = 0
  let fullyReleased = 0
  let cancelled = 0
  const lockedByMint = new Map<string, bigint>()

  for (const { account } of all) {
    const v = account as unknown as VaultAccount
    if (v.cancelled) {
      cancelled++
      continue
    }
    if (isFullyReleased(v)) {
      fullyReleased++
    } else {
      active++
    }

    const locked = BigInt(v.totalAmount.toString()) - BigInt(v.releasedAmount.toString())
    if (locked > 0n) {
      const key = v.mint.toBase58()
      lockedByMint.set(key, (lockedByMint.get(key) ?? 0n) + locked)
    }
  }

  return {
    totalVaults: all.length,
    active,
    fullyReleased,
    cancelled,
    lockedByMint: [...lockedByMint.entries()].map(([mint, locked]) => ({ mint: new PublicKey(mint), locked })),
  }
}
