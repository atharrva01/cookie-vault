// Thin wrappers around the Anchor-generated client — pages call these, never
// `program.methods.*` directly, so instruction/account wiring lives in one
// place. `.accountsStrict()` is used throughout (not `.accounts()`) so every
// account is always explicit here rather than relying on the client's
// automatic PDA/ATA resolution, which isn't worth trusting blind on a fork
// this new without a browser to verify it against.
//
// Each of these returns an unsigned `Transaction`, not a submitted
// signature — callers drive it through `sendWithStatus` (transact.ts) so
// the UI can show building/awaiting-signature/submitted/confirmed as their
// own distinct moments (design_doc.md §5), instead of Anchor's `.rpc()`
// collapsing all of that into one opaque await.
import { Buffer } from 'buffer'
import { BN, type AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, type Transaction } from '@solana/web3.js'
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PROGRAM_ID, getProgram } from './idl'
import idlJson from '../idl/cookie_vault.json'

/** Read from the IDL (itself generated from `constants.rs`) rather than hardcoded, so it can't drift from the program. */
function idlConstant(name: string): number {
  const entry = idlJson.constants.find((c) => c.name === name)
  if (!entry) throw new Error(`IDL is missing expected constant ${name}`)
  return Number(entry.value)
}
export const MAX_MILESTONES = idlConstant('MAX_MILESTONES')

export type ConditionType = { timeLock: Record<string, never> } | { milestone: Record<string, never> }
export const ConditionType = {
  TimeLock: { timeLock: {} } as ConditionType,
  Milestone: { milestone: {} } as ConditionType,
}

export interface VaultAccount {
  depositor: PublicKey
  recipient: PublicKey
  mint: PublicKey
  vaultId: BN
  conditionType: ConditionType
  totalAmount: BN
  releasedAmount: BN
  unlockTimestamp: BN | null
  milestones: { amount: BN; approvedBy: PublicKey[]; claimed: boolean }[]
  approvers: PublicKey[]
  threshold: number
  cancelled: boolean
  bump: number
}

const VAULT_SEED = Buffer.from('vault')

export function vaultPda(depositor: PublicKey, recipient: PublicKey, vaultId: bigint): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, depositor.toBuffer(), recipient.toBuffer(), new BN(vaultId.toString()).toArrayLike(Buffer, 'le', 8)],
    PROGRAM_ID,
  )
}

/** The vault's own ATA — `allowOwnerOffCurve: true` because a PDA isn't a real keypair-backed account. */
export function vaultTokenAccount(vault: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, vault, true)
}

interface InitializeVaultArgs {
  vaultId: bigint
  depositor: PublicKey
  recipient: PublicKey
  mint: PublicKey
  conditionType: ConditionType
  totalAmount: bigint
  unlockTimestamp?: bigint | null
  milestoneAmounts?: bigint[] | null
}

export async function initializeVaultTx(provider: AnchorProvider, args: InitializeVaultArgs): Promise<Transaction> {
  const program = getProgram(provider)
  const [vault] = vaultPda(args.depositor, args.recipient, args.vaultId)
  const depositorTokenAccount = getAssociatedTokenAddressSync(args.mint, args.depositor)
  const vaultTokenAcct = vaultTokenAccount(vault, args.mint)

  return program.methods
    .initializeVault(
      new BN(args.vaultId.toString()),
      args.recipient,
      args.conditionType,
      new BN(args.totalAmount.toString()),
      args.unlockTimestamp != null ? new BN(args.unlockTimestamp.toString()) : null,
      args.milestoneAmounts ? args.milestoneAmounts.map((a) => new BN(a.toString())) : null,
    )
    .accountsStrict({
      depositor: args.depositor,
      vault,
      mint: args.mint,
      depositorTokenAccount,
      vaultTokenAccount: vaultTokenAcct,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction()
}

interface ClaimArgs {
  vault: PublicKey
  recipient: PublicKey
  mint: PublicKey
  milestoneIndex?: number | null
}

export async function claimTx(provider: AnchorProvider, args: ClaimArgs): Promise<Transaction> {
  const program = getProgram(provider)
  const vaultTokenAcct = vaultTokenAccount(args.vault, args.mint)
  const recipientTokenAccount = getAssociatedTokenAddressSync(args.mint, args.recipient)

  return program.methods
    .claim(args.milestoneIndex ?? null)
    .accountsStrict({
      recipient: args.recipient,
      vault: args.vault,
      mint: args.mint,
      vaultTokenAccount: vaultTokenAcct,
      recipientTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction()
}

export async function approveMilestoneTx(
  provider: AnchorProvider,
  vault: PublicKey,
  approver: PublicKey,
  milestoneIndex: number,
): Promise<Transaction> {
  const program = getProgram(provider)
  return program.methods.approveMilestone(milestoneIndex).accountsStrict({ approver, vault }).transaction()
}

interface CancelVaultArgs {
  vault: PublicKey
  depositor: PublicKey
  mint: PublicKey
}

export async function cancelVaultTx(provider: AnchorProvider, args: CancelVaultArgs): Promise<Transaction> {
  const program = getProgram(provider)
  const vaultTokenAcct = vaultTokenAccount(args.vault, args.mint)
  const depositorTokenAccount = getAssociatedTokenAddressSync(args.mint, args.depositor)

  return program.methods
    .cancelVault()
    .accountsStrict({
      depositor: args.depositor,
      vault: args.vault,
      mint: args.mint,
      vaultTokenAccount: vaultTokenAcct,
      depositorTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction()
}

export async function fetchVault(provider: AnchorProvider, vault: PublicKey): Promise<VaultAccount | null> {
  const program = getProgram(provider)
  try {
    return (await program.account.vault.fetch(vault)) as unknown as VaultAccount
  } catch {
    return null
  }
}

export interface VaultListEntry {
  pda: PublicKey
  account: VaultAccount
}

// Offsets into the raw account bytes: 8-byte Anchor discriminator, then
// `depositor: Pubkey` (32 bytes) immediately, then `recipient: Pubkey` (32
// bytes) immediately after that — both fixed-size and both the first two
// fields declared on `Vault` (state.rs), so these offsets are safe to hand
// compute. Nothing past `recipient` should ever be memcmp'd this way —
// every later field sits behind at least one variable-length `Vec`.
const DEPOSITOR_OFFSET = 8
const RECIPIENT_OFFSET = 8 + 32

/** Every vault where `wallet` is the depositor or the recipient, deduped by address. */
export async function fetchVaultsFor(provider: AnchorProvider, wallet: PublicKey): Promise<VaultListEntry[]> {
  const program = getProgram(provider)
  const [asDepositor, asRecipient] = await Promise.all([
    program.account.vault.all([{ memcmp: { offset: DEPOSITOR_OFFSET, bytes: wallet.toBase58() } }]),
    program.account.vault.all([{ memcmp: { offset: RECIPIENT_OFFSET, bytes: wallet.toBase58() } }]),
  ])
  const byAddress = new Map<string, VaultListEntry>()
  for (const { publicKey, account } of [...asDepositor, ...asRecipient]) {
    byAddress.set(publicKey.toBase58(), { pda: publicKey, account: account as unknown as VaultAccount })
  }
  return [...byAddress.values()]
}
