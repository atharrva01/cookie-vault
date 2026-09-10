import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { PublicKey, type Transaction } from '@solana/web3.js'
import type { Wallet, WalletAccount } from '@wallet-standard/base'
import { COOKIE_GENESIS_HASH } from '../lib/chain'
import {
  connectWallet,
  disconnectWallet,
  listSolanaWallets,
  nightlyCanSwitch,
  nightlyOnNetwork,
  nightlySwitchNetwork,
  onAccountChange,
  onWalletRegistry,
  signWithWallet,
  walletErrorMessage,
} from '../lib/wallet'

export interface WalletState {
  wallets: Wallet[]
  wallet: Wallet | null
  account: WalletAccount | null
  publicKey: PublicKey | null
  connecting: boolean
  error: string | null
  /** Nightly only: is the wallet currently pointed at Cookie Chain? null when unknown / not Nightly. */
  onCookieChain: boolean | null
  canSwitchNetwork: boolean
  connect: (wallet: Wallet) => Promise<void>
  disconnect: () => Promise<void>
  switchToCookieChain: () => Promise<void>
  sign: (tx: Transaction) => Promise<Uint8Array>
}

export const WalletStateContext = createContext<WalletState | null>(null)
const LAST_WALLET_KEY = 'cookie-vault.wallet'

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<Wallet[]>(() => listSolanaWallets())
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [account, setAccount] = useState<WalletAccount | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => onWalletRegistry(() => setWallets(listSolanaWallets())), [])

  const connect = useCallback(async (w: Wallet) => {
    setConnecting(true)
    setError(null)
    try {
      const acc = await connectWallet(w)
      setWallet(w)
      setAccount(acc)
      try {
        localStorage.setItem(LAST_WALLET_KEY, w.name)
      } catch {
        /* private browsing etc. — silent reconnect just won't persist */
      }
    } catch (e) {
      setError(walletErrorMessage(e))
      throw e
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (wallet) await disconnectWallet(wallet)
    setWallet(null)
    setAccount(null)
    try {
      localStorage.removeItem(LAST_WALLET_KEY)
    } catch {
      /* ignore */
    }
  }, [wallet])

  // Silently reconnect to whichever wallet was connected last time.
  useEffect(() => {
    let lastName: string | null = null
    try {
      lastName = localStorage.getItem(LAST_WALLET_KEY)
    } catch {
      /* ignore */
    }
    if (!lastName || wallet) return
    const w = wallets.find((x) => x.name === lastName)
    if (!w) return
    let cancelled = false
    connectWallet(w, true)
      .then((acc) => {
        if (cancelled) return
        setWallet(w)
        setAccount(acc)
      })
      .catch(() => undefined) // silent reconnect failing is not an error worth surfacing
    return () => {
      cancelled = true
    }
  }, [wallets, wallet])

  useEffect(() => {
    if (!wallet) return
    return onAccountChange(wallet, (acc) => {
      setAccount(acc)
      if (!acc) setWallet(null)
    })
  }, [wallet])

  const sign = useCallback(
    async (tx: Transaction) => {
      if (!wallet || !account) throw new Error('Connect a wallet first')
      return signWithWallet(wallet, account, tx)
    },
    [wallet, account],
  )

  // Nightly-only: track whether it's pointed at Cookie Chain (the user can
  // switch networks from inside the extension at any time, so poll).
  const [onCookieChain, setOnCookieChain] = useState<boolean | null>(null)
  useEffect(() => {
    if (!wallet) {
      setOnCookieChain(null)
      return
    }
    const tick = () => setOnCookieChain(nightlyOnNetwork(COOKIE_GENESIS_HASH))
    tick()
    const id = setInterval(tick, 2000)
    return () => clearInterval(id)
  }, [wallet, account])

  const switchToCookieChain = useCallback(async () => {
    setError(null)
    try {
      await nightlySwitchNetwork(COOKIE_GENESIS_HASH, import.meta.env.VITE_RPC_URL ?? '')
      setOnCookieChain(nightlyOnNetwork(COOKIE_GENESIS_HASH))
    } catch (e) {
      setError(walletErrorMessage(e))
      throw e
    }
  }, [])

  // Offer the switch once, automatically, right after connecting on the wrong network.
  const [offered, setOffered] = useState(false)
  useEffect(() => {
    if (onCookieChain === false && !offered && nightlyCanSwitch()) {
      setOffered(true)
      void switchToCookieChain().catch(() => undefined)
    }
    if (onCookieChain !== false) setOffered(false)
  }, [onCookieChain, offered, switchToCookieChain])

  const publicKey = useMemo(() => (account ? new PublicKey(account.publicKey) : null), [account])

  const value = useMemo<WalletState>(
    () => ({
      wallets,
      wallet,
      account,
      publicKey,
      connecting,
      error,
      onCookieChain,
      canSwitchNetwork: nightlyCanSwitch(),
      connect,
      disconnect,
      switchToCookieChain,
      sign,
    }),
    [wallets, wallet, account, publicKey, connecting, error, onCookieChain, connect, disconnect, switchToCookieChain, sign],
  )

  return <WalletStateContext.Provider value={value}>{children}</WalletStateContext.Provider>
}
