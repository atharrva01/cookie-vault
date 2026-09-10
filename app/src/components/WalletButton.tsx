import { useEffect, useState } from 'react'
import { COOK_DECIMALS, connection, formatUnits, shortAddr } from '../lib/chain'
import { NIGHTLY_NAME } from '../lib/wallet'
import { useWallet } from '../hooks/useWallet'

const NIGHTLY_INSTALL_URL = 'https://nightly.app'

/** Shown wherever a transaction is about to happen: nudges Nightly onto Cookie Chain. */
export function NetworkBanner() {
  const { onCookieChain, canSwitchNetwork, switchToCookieChain } = useWallet()
  if (onCookieChain !== false) return null
  return (
    <div className="callout warn">
      Your wallet is on another network. Cookie Vault only works on Cookie Chain, so switch to it, or the
      transaction simulation and balance shown here won't be accurate.{' '}
      {canSwitchNetwork ? (
        <button className="sm primary" onClick={() => void switchToCookieChain().catch(() => undefined)}>
          Switch to Cookie Chain
        </button>
      ) : (
        <span>
          Add Cookie Chain manually with RPC <span className="mono">https://rpc.cookiescan.io</span> in your
          wallet's network settings.
        </span>
      )}
    </div>
  )
}

function useCookBalance(publicKey: import('@solana/web3.js').PublicKey | null) {
  const [balance, setBalance] = useState<bigint | null>(null)

  useEffect(() => {
    if (!publicKey) {
      setBalance(null)
      return
    }
    let cancelled = false
    const refresh = () =>
      connection
        .getBalance(publicKey)
        .then((lamports) => !cancelled && setBalance(BigInt(lamports)))
        .catch(() => undefined)
    refresh()
    const id = setInterval(refresh, 15_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [publicKey])

  return balance
}

export function WalletButton() {
  const { wallets, wallet, account, publicKey, connecting, error, connect, disconnect } = useWallet()
  const [open, setOpen] = useState(false)
  const balance = useCookBalance(publicKey)

  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  if (wallet && account) {
    return (
      <div className="wallet-pill">
        {wallet.icon && <img src={wallet.icon} alt="" width={18} height={18} />}
        <span className="mono" title={account.address}>
          {shortAddr(account.address)}
        </span>
        <span className="muted small">
          {balance === null ? '…' : `${formatUnits(balance, COOK_DECIMALS, 3)} COOK`}
        </span>
        <button className="ghost sm" onClick={() => void disconnect()}>
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <>
      <button className="primary" onClick={() => setOpen(true)} disabled={connecting}>
        {connecting ? 'Connecting…' : 'Connect wallet'}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose a wallet">
            <h3>Connect a wallet</h3>
            <p className="muted small">
              Nightly is the recommended wallet for Cookie Chain, and switches network automatically once
              connected.
            </p>
            {wallets.length === 0 && (
              <div className="callout">
                No Solana wallet detected.{' '}
                <a href={NIGHTLY_INSTALL_URL} target="_blank" rel="noreferrer">
                  Install Nightly
                </a>{' '}
                and reload this page.
              </div>
            )}
            <div className="wallet-list">
              {wallets.map((w) => (
                <button
                  key={w.name}
                  className="wallet-option"
                  onClick={() => {
                    setOpen(false)
                    void connect(w).catch(() => undefined)
                  }}
                >
                  {w.icon && <img src={w.icon} alt="" width={28} height={28} />}
                  <span>{w.name}</span>
                  {w.name === NIGHTLY_NAME && <span className="tag">recommended</span>}
                </button>
              ))}
            </div>
            {error && <p className="error">{error}</p>}
            <button className="ghost" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
