import type { AnchorProvider } from '@coral-xyz/anchor'
import type { Transaction } from '@solana/web3.js'
import type { TxPhase } from './txStatus'

/**
 * Drives one transaction through build -> awaiting-signature -> submitted
 * -> confirmed, reporting each transition via `onPhase` so the UI can show
 * them as distinct moments (design_doc.md §5) — reimplements the relevant
 * half of `AnchorProvider.sendAndConfirm` by hand instead of calling
 * `.rpc()`, specifically to get that visibility; see program.ts's header
 * comment.
 */
export async function sendWithStatus(
  provider: AnchorProvider,
  buildTx: () => Promise<Transaction>,
  onPhase: (phase: TxPhase) => void,
): Promise<string> {
  onPhase({ kind: 'building' })
  const tx = await buildTx()
  tx.feePayer ??= provider.wallet.publicKey
  const latestBlockhash = await provider.connection.getLatestBlockhash(provider.opts.preflightCommitment)
  tx.recentBlockhash = latestBlockhash.blockhash

  onPhase({ kind: 'awaiting-signature' })
  const signed = await provider.wallet.signTransaction(tx)

  const signature = await provider.connection.sendRawTransaction(signed.serialize(), {
    preflightCommitment: provider.opts.preflightCommitment,
  })
  onPhase({ kind: 'submitted', signature })

  const confirmation = await provider.connection.confirmTransaction(
    { signature, ...latestBlockhash },
    provider.opts.commitment,
  )
  if (confirmation.value.err) {
    throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`)
  }

  onPhase({ kind: 'confirmed', signature })
  return signature
}
