// Vault activity feed — chronological create/approve/claim/cancel log,
// design_doc.md §9. Cookie Vault's own program isn't a "known" program to
// the RPC's transaction parser, so each instruction on a vault-touching
// transaction comes back only partially decoded (raw base58 `data`, not a
// friendly `{name, args}`); Anchor's own instruction coder — built from the
// same IDL the rest of the app already uses — turns that back into the
// actual instruction name.
import { BorshInstructionCoder, type AnchorProvider, type Idl } from '@coral-xyz/anchor'
import type { ParsedInstruction, PartiallyDecodedInstruction, PublicKey } from '@solana/web3.js'
import { PROGRAM_ID } from './idl'
import idlJson from '../idl/cookie_vault.json'

// `program.coder.instruction` is typed as the generic `InstructionCoder`
// interface, which only declares `encode` — `decode` exists on the concrete
// `BorshInstructionCoder` class but isn't visible through that narrower
// interface type, so this constructs one directly from the IDL instead.
const instructionCoder = new BorshInstructionCoder(idlJson as Idl)

export interface ActivityEntry {
  signature: string
  slot: number
  blockTime: number | null
  label: string
}

const INSTRUCTION_LABELS: Record<string, string> = {
  initializeVault: 'Vault created',
  claim: 'Claimed',
  approveMilestone: 'Milestone approved',
  cancelVault: 'Vault cancelled',
}

function isPartiallyDecoded(
  ix: ParsedInstruction | PartiallyDecodedInstruction,
): ix is PartiallyDecodedInstruction {
  return 'data' in ix
}

/** Most recent `limit` transactions touching `vault`, newest first, labeled by instruction. */
export async function fetchVaultActivity(provider: AnchorProvider, vault: PublicKey, limit = 15): Promise<ActivityEntry[]> {
  const sigInfos = await provider.connection.getSignaturesForAddress(vault, { limit })

  return Promise.all(
    sigInfos.map(async (sigInfo): Promise<ActivityEntry> => {
      let label = 'Unknown activity'
      try {
        const tx = await provider.connection.getParsedTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
        })
        const ix = tx?.transaction.message.instructions
          .filter(isPartiallyDecoded)
          .find((i) => i.programId.equals(PROGRAM_ID))
        if (ix) {
          const decoded = instructionCoder.decode(ix.data, 'base58')
          if (decoded) label = INSTRUCTION_LABELS[decoded.name] ?? decoded.name
        }
      } catch {
        /* one bad entry (e.g. an expired/pruned tx) shouldn't break the whole feed */
      }
      return { signature: sigInfo.signature, slot: sigInfo.slot, blockTime: sigInfo.blockTime ?? null, label }
    }),
  )
}
