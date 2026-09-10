// `?mock=1` adds a synthetic Wallet Standard wallet to the picker, backed by
// a freshly generated (unfunded) keypair, so every UI state that depends on
// "a wallet is connected" — form enabling, role-based Claim/Approve
// visibility, balance display, My Vaults' fetch — is reachable without
// installing a browser extension or having a real wallet at hand. It only
// fakes the *wallet*, not the RPC: reads go against the real Cookie Chain
// network (free, and a genuinely useful check that things resolve
// correctly), and an actual write will correctly fail with "insufficient
// funds" once it reaches the network, since this keypair holds nothing —
// that's real behavior, not something worth faking too.
import { Keypair, Transaction } from '@solana/web3.js'
import type { Wallet, WalletAccount } from '@wallet-standard/base'

export const MOCK_WALLET_NAME = 'Mock Wallet (dev)'

export function isMockMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('mock') === '1'
  } catch {
    return false
  }
}

let mockKeypair: Keypair | null = null
function getMockKeypair(): Keypair {
  mockKeypair ??= Keypair.generate()
  return mockKeypair
}

export function createMockWallet(): Wallet {
  const keypair = getMockKeypair()
  const account = {
    address: keypair.publicKey.toBase58(),
    publicKey: keypair.publicKey.toBytes(),
    chains: ['solana:mainnet'],
    features: ['solana:signTransaction'],
  } as unknown as WalletAccount

  return {
    version: '1.0.0',
    name: MOCK_WALLET_NAME,
    icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
    chains: ['solana:mainnet'],
    accounts: [account],
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: () => Promise.resolve({ accounts: [account] }),
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: () => Promise.resolve(),
      },
      'standard:events': {
        version: '1.0.0',
        on: () => () => undefined,
      },
      'solana:signTransaction': {
        version: '1.0.0',
        signTransaction: (...inputs: { transaction: Uint8Array }[]) =>
          Promise.resolve(
            inputs.map(({ transaction }) => {
              const tx = Transaction.from(transaction)
              tx.partialSign(keypair)
              return { signedTransaction: tx.serialize({ requireAllSignatures: false }) }
            }),
          ),
      },
    },
  } as unknown as Wallet
}
