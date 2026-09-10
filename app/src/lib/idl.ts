// Anchor's generated TypeScript client, built from the program's own IDL —
// `npm run sync-idl` copies both `target/idl/cookie_vault.json` (the IDL
// itself) and `target/types/cookie_vault.ts` (its TS type) here whenever the
// program's instructions/accounts change. Never hand-write instruction
// encoding against this program; always go through this client.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { PublicKey, Transaction, type VersionedTransaction } from '@solana/web3.js'
import type { Connection } from '@solana/web3.js'
import idlJson from '../idl/cookie_vault.json'
import type { CookieVault } from '../idl/cookie_vault'

export const PROGRAM_ID = new PublicKey(idlJson.address)

/**
 * The `Wallet` shape `AnchorProvider` actually expects (from `provider.ts`)
 * — deliberately not imported from the package root, since `Wallet` there
 * resolves to the Node-only `NodeWallet` class (requires a `payer` Keypair),
 * which shadows the lighter structural interface this needs.
 */
interface WalletLike {
  publicKey: PublicKey
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>
}

/** Adapts our raw Wallet Standard `sign` function to what `AnchorProvider` expects. */
export function buildProvider(
  connection: Connection,
  publicKey: PublicKey,
  sign: (tx: Transaction) => Promise<Uint8Array>,
): AnchorProvider {
  const wallet: WalletLike = {
    publicKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      if (!(tx instanceof Transaction)) throw new Error('Cookie Vault only builds legacy Transactions')
      const signed = await sign(tx)
      return Transaction.from(signed) as unknown as T
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      const signed: T[] = []
      for (const tx of txs) {
        if (!(tx instanceof Transaction)) throw new Error('Cookie Vault only builds legacy Transactions')
        signed.push(Transaction.from(await sign(tx)) as unknown as T)
      }
      return signed
    },
  }
  return new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
}

export function getProgram(provider: AnchorProvider): Program<CookieVault> {
  return new Program<CookieVault>(idlJson as CookieVault, provider)
}

/**
 * A provider for read-only calls (`program.account.*.fetch`/`.all`) when no
 * wallet is connected — vault state is public on-chain data, so viewing it
 * shouldn't require one (design_doc.md §2: "anyone can view a vault's
 * status"). `AnchorProvider` still requires *some* wallet-shaped object;
 * this one's signing methods throw instead of silently doing something
 * wrong if a write path ever accidentally reaches them.
 */
export function buildReadOnlyProvider(connection: Connection): AnchorProvider {
  const wallet: WalletLike = {
    publicKey: PublicKey.default,
    signTransaction() {
      return Promise.reject(new Error('Connect a wallet to sign transactions'))
    },
    signAllTransactions() {
      return Promise.reject(new Error('Connect a wallet to sign transactions'))
    },
  }
  return new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
}
