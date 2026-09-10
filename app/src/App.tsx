import { useEffect, useState } from 'react'
import { WalletProvider } from './components/WalletContext'
import { WalletButton } from './components/WalletButton'
import { connection } from './lib/chain'

function useChainUp(): boolean {
  const [up, setUp] = useState(true)
  useEffect(() => {
    let cancelled = false
    const check = () =>
      connection
        .getSlot()
        .then(() => !cancelled && setUp(true))
        .catch(() => !cancelled && setUp(false))
    check()
    const id = setInterval(check, 10_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])
  return up
}

function Topbar() {
  const up = useChainUp()
  return (
    <header className="topbar">
      <a href="/" className="brand">
        <span aria-hidden>🍪</span> Cookie Vault
      </a>
      <div className="topbar-right">
        <span className={`chain-badge${up ? '' : ' down'}`}>
          <span className="pulse" /> {up ? 'Cookie Chain' : 'RPC unreachable'}
        </span>
        <WalletButton />
      </div>
    </header>
  )
}

function Home() {
  return (
    <main>
      <section className="hero">
        <h1>Programmable escrow for Cookie Chain</h1>
        <p className="lead">
          Lock funds once, release them under conditions you define — a full unlock on a date, or
          milestone-by-milestone as work is delivered and approved.
        </p>
      </section>
      <div className="card">
        <p className="muted small">
          Wallet connection and chain status are wired up. Vault creation, claiming, and approval flows land in
          the next phases.
        </p>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <WalletProvider>
      <Topbar />
      <Home />
    </WalletProvider>
  )
}
