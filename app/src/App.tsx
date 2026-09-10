import { useEffect, useState, type ReactNode } from 'react'
import { WalletProvider } from './components/WalletContext'
import { WalletButton } from './components/WalletButton'
import { connection } from './lib/chain'
import { isMockMode } from './lib/mock'
import { navigate, useRoute } from './lib/router'
import CreateVault from './pages/CreateVault'
import MyVaults from './pages/MyVaults'
import VaultDetail from './pages/VaultDetail'

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

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      href={`#${to}`}
      onClick={(e) => {
        e.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

function Topbar() {
  const up = useChainUp()
  return (
    <header className="topbar">
      <NavLink to="/">
        <span className="brand">
          <span aria-hidden>🍪</span> Cookie Vault
        </span>
      </NavLink>
      <nav style={{ display: 'flex', gap: 14 }}>
        <NavLink to="/vaults">My Vaults</NavLink>
        <NavLink to="/create">Create Vault</NavLink>
      </nav>
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
        <button className="primary" onClick={() => navigate('/create')}>
          Create a vault
        </button>
      </section>
    </main>
  )
}

function MockBanner() {
  if (!isMockMode()) return null
  return (
    <div className="callout warn" style={{ margin: '0 20px', marginTop: 12 }}>
      <strong>Mock mode.</strong> "{`Mock Wallet (dev)`}" in the wallet picker is a freshly generated, unfunded
      keypair — reads hit the real Cookie Chain network, but any write will correctly fail with "insufficient
      funds" once it reaches the chain. For UI testing only; drop <span className="mono">?mock=1</span> from the
      URL for the real thing.
    </div>
  )
}

function NotFound() {
  return (
    <main>
      <p>Nothing here.</p>
      <button className="ghost" onClick={() => navigate('/')}>
        Back home
      </button>
    </main>
  )
}

function Routes() {
  const { path } = useRoute()
  switch (path) {
    case '/':
      return <Home />
    case '/create':
      return <CreateVault />
    case '/vaults':
      return <MyVaults />
    case '/vault':
      return <VaultDetail />
    default:
      return <NotFound />
  }
}

export default function App() {
  return (
    <WalletProvider>
      <Topbar />
      <MockBanner />
      <Routes />
    </WalletProvider>
  )
}
