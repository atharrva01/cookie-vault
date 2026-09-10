// Wallet Standard integration, used directly rather than through
// @solana/wallet-adapter-react-ui — see design_doc.md §5 for why: it's the
// difference between a custom-designed connect flow and the instantly
// recognizable generic wallet-adapter modal.
import { getWallets } from '@wallet-standard/app'
import type { IdentifierString, Wallet, WalletAccount } from '@wallet-standard/base'
import type { Transaction } from '@solana/web3.js'

type ConnectFeature = {
  connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }>
}
type DisconnectFeature = { disconnect: () => Promise<void> }
type EventsFeature = {
  on: (event: 'change', listener: (props: { accounts?: readonly WalletAccount[] }) => void) => () => void
}
type SignTransactionFeature = {
  signTransaction: (
    ...inputs: { transaction: Uint8Array; account: WalletAccount; chain?: IdentifierString }[]
  ) => Promise<readonly { signedTransaction: Uint8Array }[]>
}

export const NIGHTLY_NAME = 'Nightly'

/** Every registered Wallet Standard wallet that can sign Solana transactions, Nightly first. */
export function listSolanaWallets(): Wallet[] {
  return getWallets()
    .get()
    .filter((w) => 'solana:signTransaction' in w.features && 'standard:connect' in w.features)
    .sort((a, b) => Number(b.name === NIGHTLY_NAME) - Number(a.name === NIGHTLY_NAME))
}

/** Wallets can register after page load (extension still initializing) — call `cb` when the list changes. */
export function onWalletRegistry(cb: () => void): () => void {
  const { on } = getWallets()
  const offs = [on('register', cb), on('unregister', cb)]
  return () => offs.forEach((off) => off())
}

function solanaAccount(accounts: readonly WalletAccount[]): WalletAccount | null {
  return accounts.find((a) => a.chains.some((c) => c.startsWith('solana:'))) ?? accounts[0] ?? null
}

export async function connectWallet(wallet: Wallet, silent = false): Promise<WalletAccount> {
  const feature = wallet.features['standard:connect'] as ConnectFeature
  const { accounts } = await feature.connect(silent ? { silent: true } : undefined)
  const account = solanaAccount(accounts.length ? accounts : wallet.accounts)
  if (!account) throw new Error('The wallet returned no Solana account')
  return account
}

export async function disconnectWallet(wallet: Wallet): Promise<void> {
  const feature = wallet.features['standard:disconnect'] as DisconnectFeature | undefined
  if (feature) await feature.disconnect().catch(() => undefined)
}

/** Follows account switches made inside the wallet extension itself. */
export function onAccountChange(wallet: Wallet, cb: (account: WalletAccount | null) => void): () => void {
  const feature = wallet.features['standard:events'] as EventsFeature | undefined
  if (!feature) return () => undefined
  return feature.on('change', (props) => {
    if (props.accounts) cb(solanaAccount(props.accounts))
  })
}

export async function signWithWallet(wallet: Wallet, account: WalletAccount, tx: Transaction): Promise<Uint8Array> {
  const feature = wallet.features['solana:signTransaction'] as SignTransactionFeature
  const chain = (account.chains.find((c) => c.startsWith('solana:')) ?? 'solana:mainnet') as IdentifierString
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false })
  const [result] = await feature.signTransaction({ transaction: serialized, account, chain })
  if (!result?.signedTransaction) throw new Error('Wallet returned no signed transaction')
  return result.signedTransaction
}

// --- Nightly network switching ---------------------------------------------
// Nightly exposes a non-standard `changeNetwork` on its injected object, so a
// dApp can ask it to switch to any SVM network by genesis hash + RPC URL
// (see docs.nightly.app's change_network docs).
type NightlySolana = {
  genesisHash?: string
  changeNetwork?: (n: { genesisHash: string; url?: string }) => Promise<unknown>
}
function nightlyObject(): NightlySolana | null {
  const w = window as unknown as { nightly?: { solana?: NightlySolana } }
  return w.nightly?.solana ?? null
}

/** true = Nightly is already on Cookie Chain, false = on another network, null = not Nightly / unknown. */
export function nightlyOnNetwork(genesisHash: string): boolean | null {
  const nightly = nightlyObject()
  if (!nightly?.genesisHash) return null
  return nightly.genesisHash === genesisHash
}

export function nightlyCanSwitch(): boolean {
  return typeof nightlyObject()?.changeNetwork === 'function'
}

export async function nightlySwitchNetwork(genesisHash: string, url: string): Promise<void> {
  const nightly = nightlyObject();
  if (!nightly?.changeNetwork) throw new Error('This wallet cannot switch networks from a dApp')
  await nightly.changeNetwork({ genesisHash, url })
}

/** Turns a thrown wallet error into something safe to show a user. */
export function walletErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/reject|denied|cancel|declin/i.test(msg)) return 'You rejected the request in your wallet.'
  return msg
}
